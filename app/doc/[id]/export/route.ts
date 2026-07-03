import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import type { CommentInfo, ProjectRole } from "@/lib/repo";

export const dynamic = "force-dynamic";

const roleLabel: Record<ProjectRole, string> = {
  planner: "기획자",
  developer: "개발자",
  designer: "디자이너",
  ops: "운영자",
};

const langLabel = { ko: "한국어", en: "English", ja: "日本語" } as const;

const translationStatusLabel = {
  ok: "완료",
  pending: "생성 중",
  failed: "실패",
} as const;

function formatTs(ts: string): string {
  return ts.replace("T", " ").slice(0, 16);
}

/** 댓글 트리를 들여쓰기 리스트로 직렬화 (parent_id 기준, 고아 답글은 최상위 승격) */
function renderCommentThread(comments: CommentInfo[]): string[] {
  const byParent = new Map<number | null, CommentInfo[]>();
  const ids = new Set(comments.map((c) => c.id));
  for (const c of comments) {
    const key = c.parentId !== null && ids.has(c.parentId) ? c.parentId : null;
    const arr = byParent.get(key);
    if (arr) arr.push(c);
    else byParent.set(key, [c]);
  }

  const lines: string[] = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      const indent = "  ".repeat(depth);
      // 멀티라인 본문은 리스트 항목 들여쓰기에 맞춰 이어 붙인다
      const body = c.body.trim().replace(/\r?\n/g, `\n${indent}  `);
      lines.push(
        `${indent}- **${roleLabel[c.authorRole]} ${c.authorUsername}** (${formatTs(c.createdAt)}): ${body}`
      );
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines;
}

/**
 * 문서 전체를 단일 Markdown 파일로 내보낸다.
 * 섹션 구성: 메타 → 최신 Abstract/TOC → ① 합의된 원문(SSOT, 시간순)
 * → ② 번역 기록(블록별 상대 직군 번역본+상태) → ③ 댓글(블록별 스레드).
 * 다운스트림 파이프라인(SKILL.md 등) 연계를 위한 canonical markdown 출력.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("unauthorized", { status: 401 });

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId))
    return new NextResponse("not found", { status: 404 });

  const doc = repo.getDocument(docId);
  if (!doc) return new NextResponse("not found", { status: 404 });

  // 접근 게이트 — 멤버만. 비멤버는 존재를 숨겨 404 (IDOR 방어).
  const viewerRole = repo.requireDocAccess(docId, session.uid);
  if (!viewerRole) return new NextResponse("not found", { status: 404 });

  const abstract = repo.getLatestAbstract(docId);
  const blocks = repo.getTimeline(docId, viewerRole); // 블록 + 댓글 (번역 필드는 섹션②에서 별도 처리)
  const allTranslations = repo.listBlockTranslations(docId);
  const agreed = Boolean(doc.approvalPlannerAt && doc.approvalDeveloperAt);
  const totalComments = blocks.reduce((n, b) => n + b.comments.length, 0);

  const lines: string[] = [];
  lines.push(`# ${doc.title}`);
  lines.push("");
  lines.push(`> SyncDoc 내보내기 · ${formatTs(new Date().toISOString())}`);
  lines.push(
    `> 상태: ${doc.status === "archived" ? `보관됨 (${doc.archivedAt ? formatTs(doc.archivedAt) : ""})` : "진행 중"} · 합의: ${
      agreed
        ? `✅ 기획자 ${formatTs(doc.approvalPlannerAt!)} / 개발자 ${formatTs(doc.approvalDeveloperAt!)}`
        : "미합의"
    } · 블록 ${blocks.length}개 · 댓글 ${totalComments}개`
  );
  lines.push("");

  if (abstract) {
    lines.push("## Abstract");
    lines.push("");
    lines.push(abstract.abstractMd.trim());
    lines.push("");
    lines.push("### 목차");
    lines.push("");
    lines.push(abstract.tocMd.trim());
    lines.push("");
    lines.push(`*표지 생성: ${formatTs(abstract.generatedAt)}*`);
    lines.push("");
  }

  // ① 합의된 원문 — SSOT. 다운스트림 연계 시 이 섹션이 정본이다.
  lines.push("---");
  lines.push("");
  lines.push("## 합의된 원문 (히스토리, 시간순)");
  lines.push("");
  for (const b of blocks) {
    lines.push(`### ${b.versionTag ?? "(버전 태그 없음)"}`);
    lines.push("");
    lines.push(b.sourceMd.trim());
    lines.push("");
  }

  // ② 번역 기록 — 각 직군이 실제로 읽은 뷰 (블록 × 직군)
  lines.push("---");
  lines.push("");
  lines.push("## 번역 기록 (AI 생성, 블록 × 직군별)");
  lines.push("");
  const tByBlock = new Map<number, typeof allTranslations>();
  for (const t of allTranslations) {
    const arr = tByBlock.get(t.blockId);
    if (arr) arr.push(t);
    else tByBlock.set(t.blockId, [t]);
  }
  for (const b of blocks) {
    const tag = b.versionTag ?? "(버전 태그 없음)";
    const ts = tByBlock.get(b.id) ?? [];
    if (ts.length === 0) {
      lines.push(`### ${tag} — (번역 없음)`);
      lines.push("");
      continue;
    }
    for (const t of ts) {
      const status = translationStatusLabel[t.status];
      lines.push(`### ${tag} → ${roleLabel[t.targetRole]} · ${langLabel[t.targetLang]} 뷰 — ${status}`);
      lines.push("");
      lines.push(
        t.status === "ok" && t.translatedMd
          ? t.translatedMd.trim()
          : `*(번역본 없음 — 상태: ${status})*`
      );
      lines.push("");
    }
  }

  // ③ 댓글 — 블록별 스레드 (들여쓰기 = 답글)
  lines.push("---");
  lines.push("");
  lines.push("## 댓글 (블록별 스레드)");
  lines.push("");
  const blocksWithComments = blocks.filter((b) => b.comments.length > 0);
  if (blocksWithComments.length === 0) {
    lines.push("*(댓글 없음)*");
    lines.push("");
  } else {
    for (const b of blocksWithComments) {
      lines.push(`### ${b.versionTag ?? "(버전 태그 없음)"}`);
      lines.push("");
      lines.push(...renderCommentThread(b.comments));
      lines.push("");
    }
  }

  const md = lines.join("\n");
  const safeTitle = doc.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
  const filename = `${safeTitle}-${formatTs(new Date().toISOString()).slice(0, 10)}.md`;

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
