"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import type { Lang, ProjectRole, Role } from "@/lib/repo";
import { isSectionKey, type SectionKey } from "@/lib/sections";
import { suggestReplies, extractFileText } from "@/lib/ai";
import type { SuggestResult } from "@/lib/ai";
import { saveUploadedFile, isTextMime, MAX_UPLOAD_BYTES } from "@/lib/uploads";
import {
  runBlockJob as runTranslation,
  runSectionI18nJob as runSectionI18n,
} from "@/lib/translation-runner";

const asSection = (v: unknown): SectionKey | null =>
  isSectionKey(v) ? v : null;
const asLang = (v: unknown): Lang => (repo.isLang(v) ? v : "ko");

const PROJECT_ROLES: readonly ProjectRole[] = [
  "planner",
  "developer",
  "designer",
  "ops",
];
const asProjectRole = (v: unknown): ProjectRole | null =>
  PROJECT_ROLES.includes(v as ProjectRole) ? (v as ProjectRole) : null;

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/start");
  return session;
}

/** 잠긴 블록을 프로젝트 멤버들의 (직군 × 언어) 조합으로 번역 enqueue + 비동기 실행 */
function dispatchTranslations(sent: repo.SentBlock): void {
  const projectId = repo.getProjectIdForDoc(sent.docId);
  let pairs: { role: ProjectRole; lang: Lang }[] =
    projectId != null
      ? repo.getDistinctMemberRoleLangs(projectId)
      : // 레거시 문서(프로젝트 없음) — 상대 2축 역할, 한국어만
        [{ role: repo.oppositeRole(sent.authorRole as Role) as ProjectRole, lang: "ko" }];
  // (작성자 직군 & 한국어) = 원문이므로 제외
  pairs = pairs.filter((p) => !(p.role === sent.authorRole && p.lang === "ko"));
  if (pairs.length === 0) return;
  for (const p of pairs) repo.enqueueTranslation(sent.blockId, p.role, p.lang);
  after(() =>
    Promise.all(
      pairs.map((p) =>
        runTranslation(
          {
            blockId: sent.blockId,
            docId: sent.docId,
            sourceMd: sent.sourceMd,
            targetRole: p.role,
            targetLang: p.lang,
          },
          projectId
        )
      )
    )
  );
}

/**
 * '보내기': 초안 저장 → repo.sendBlock(단일 트랜잭션: 잠금 + pending 번역
 * 선삽입 + 승인 해제) → 응답 후 fire-and-forget으로 번역 실행.
 */
export async function sendBlock(
  docId: number,
  md: string,
  sectionKey: string | null = null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const role = repo.getDocProjectRole(docId, session.uid) ?? session.role;
  let sent: repo.SentBlock;
  try {
    const blockId = repo.saveDraft(docId, { id: session.uid, role }, md, asSection(sectionKey));
    sent = repo.sendBlock(blockId, session.uid);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/doc/${docId}`);
  dispatchTranslations(sent); // 직군별 번역 enqueue + 비동기 생성
  return { ok: true };
}

/**
 * 파일 첨부 — 업로드한 파일을 디스크에 저장하고, 그 파일을 단 채팅 메시지(블록)를 보낸다.
 * 텍스트 기반 파일(.txt/.md/json 등)은 본문을 메시지에 포함해 AI가 백서 근거로 읽는다.
 * 이미지·PDF는 주고받기·미리보기만 — 내용 추출은 후속 단계.
 */
export async function uploadAttachment(
  docId: number,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const file = formData.get("file");
  const caption = ((formData.get("caption") as string | null) ?? "").trim();
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "파일이 없습니다." };
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: "파일이 너무 큽니다 (최대 10MB)." };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const { path: savedPath } = await saveUploadedFile(buf, file.name);
    const mime = file.type || "application/octet-stream";
    const isText = isTextMime(mime, file.name);
    let textExcerpt: string | null = isText ? buf.toString("utf8").slice(0, 8000) : null;

    // 이미지·PDF: 비전 모델로 내용 추출(가능하면) → 메시지에 실어 분류·증류에 사용.
    // 큰 파일(>4MB)은 비용·지연을 피해 건너뛴다. 추출 실패/미지원이면 첨부만.
    let extracted = "";
    const extractable =
      !isText &&
      buf.byteLength <= 4 * 1024 * 1024 &&
      (mime.startsWith("image/") || mime === "application/pdf");
    if (extractable) {
      const ex = await extractFileText(buf, mime, file.name);
      if (ex.ok && ex.md.trim()) {
        extracted = ex.md.trim().slice(0, 8000);
        textExcerpt = extracted;
      }
    }

    // 메시지 본문: 캡션 + 파일 표식 (+ 텍스트/추출된 내용은 AI가 읽도록 포함)
    const lines: string[] = [];
    if (caption) lines.push(caption);
    lines.push(`📎 ${file.name}`);
    if (isText && textExcerpt) lines.push("\n```\n" + textExcerpt + "\n```");
    else if (extracted) lines.push(`\n> 첨부 내용:\n> ${extracted.replace(/\n/g, "\n> ")}`);
    const md = lines.join("\n");

    const role = repo.getDocProjectRole(docId, session.uid) ?? session.role;
    const blockId = repo.saveDraft(docId, { id: session.uid, role }, md, null);
    const sent = repo.sendBlock(blockId, session.uid);
    repo.addAttachment({
      docId,
      messageId: sent.blockId,
      kind: "file",
      path: savedPath,
      mime,
      title: file.name,
      textExcerpt,
      uploadedBy: session.uid,
    });
    revalidatePath(`/doc/${docId}`);
    dispatchTranslations(sent);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 채팅 추천 메시지(객관식) — 지금까지의 대화 + 내 직군 기준으로 보낼 만한
 * 메시지 후보 2~4개를 생성한다. 클라이언트가 골라 입력창에 넣고 보낸다.
 */
export async function requestReplySuggestions(
  docId: number
): Promise<SuggestResult> {
  const session = await requireSession();
  const role = repo.getDocProjectRole(docId, session.uid) ?? session.role;
  const lang = repo.getUserLang(session.uid);
  const convo = repo.getRecentMessages(docId, 12);
  // suggestReplies는 throw하지 않는 규약
  return suggestReplies(convo, role, lang);
}

/**
 * 백서 화면 분류 교정 (편집자 이상) — 출처 메시지를 제외하거나 다른 절로 재분류한다.
 * 변경 후 다음 렌더에서 시그니처가 바뀌어 해당 절이 자동 재증류된다.
 */
export async function correctSectionMessage(
  docId: number,
  messageId: number,
  change: { excluded?: boolean; section?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const projectId = repo.getProjectIdForDoc(docId);
  if (projectId != null) {
    const m = repo.getMembership(projectId, session.uid);
    if (!m || (m.perm !== "owner" && m.perm !== "editor"))
      return { ok: false, error: "교정 권한이 없습니다 (편집자 이상)." };
  }
  if (change.excluded !== undefined) repo.setMessageExcluded(messageId, change.excluded);
  if (change.section !== undefined) {
    const sec = change.section === null ? null : asSection(change.section);
    if (change.section === null || sec) repo.setMessageOverrideSection(messageId, sec);
  }
  revalidatePath(`/doc/${docId}`);
  return { ok: true };
}

/**
 * 내 숙련도 레벨 변경 — 이후 새로 생성되는 번역(새 블록·재시도)부터 적용된다.
 * 이미 완료(ok)된 번역은 다시 생성하지 않는다 (비용·히스토리 보존).
 */
export async function setMyLevel(docId: number, level: string): Promise<void> {
  const session = await requireSession();
  if (!repo.isExpertiseLevel(level)) return; // 화이트리스트 외 입력은 무시
  repo.setUserLevel(session.uid, level);
  revalidatePath(`/doc/${docId}`);
}

/**
 * 내 자연어 변경 — 그 언어로 이 문서를 읽기 위해 필요한 번역(블록 + 백서 산문)을
 * enqueue하고 비동기로 생성한다. 이미 있거나 한국어면 생성 없음(캐시).
 */
export async function setMyLang(docId: number, lang: string): Promise<void> {
  const session = await requireSession();
  if (!repo.isLang(lang)) return;
  repo.setUserLang(session.uid, lang);
  const role = repo.getDocProjectRole(docId, session.uid) ?? session.role;
  const projectId = repo.getProjectIdForDoc(docId);
  const blockJobs = repo.ensureBlockTranslations(docId, role, lang);
  const secJobs = repo.ensureSectionTranslations(docId, lang);
  revalidatePath(`/doc/${docId}`);
  if (blockJobs.length === 0 && secJobs.length === 0) return;
  after(() =>
    Promise.all([
      ...blockJobs.map((j) => runTranslation(j, projectId)),
      ...secJobs.map((j) => runSectionI18n(j)),
    ])
  );
}

/**
 * 문서 보관/해제 — 상태 전환만. 모든 내용(블록·번역·댓글·Abstract)은 영구 보존되어
 * 추적 가능하다. 삭제 액션은 존재하지 않는다.
 */
export async function archiveDocument(docId: number): Promise<void> {
  await requireSession();
  repo.setDocumentArchived(docId, true);
  revalidatePath(`/doc/${docId}`);
  revalidatePath("/");
}

export async function unarchiveDocument(docId: number): Promise<void> {
  await requireSession();
  repo.setDocumentArchived(docId, false);
  revalidatePath(`/doc/${docId}`);
  revalidatePath("/");
}

/**
 * 번역 (재)생성: 특정 (블록, 대상직군). 행이 없으면 새로 만들고(뷰어 직군이 뒤늦게
 * 합류한 경우), failed/오래된 pending이면 재시도한다.
 */
export async function retryTranslation(
  docId: number,
  blockId: number,
  targetRole: string,
  targetLang: string = "ko"
): Promise<void> {
  await requireSession();
  const role = asProjectRole(targetRole);
  if (!role) return; // 화이트리스트 외 입력 무시
  const job = repo.markTranslationRetry(blockId, role, asLang(targetLang));
  if (job) {
    const projectId = repo.getProjectIdForDoc(docId);
    revalidatePath(`/doc/${docId}`);
    after(() => runTranslation(job, projectId));
  }
}

