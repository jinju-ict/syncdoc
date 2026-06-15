"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import type { Lang, ProjectRole, Role } from "@/lib/repo";
import { isSectionKey, sectionLabel, type SectionKey } from "@/lib/sections";
import { suggest, suggestReplies, distillSection as distillSectionAI } from "@/lib/ai";
import type { SuggestResult } from "@/lib/ai";
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
  if (!session) redirect("/login");
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

/** 초안 임시 저장 (upsert — 잠긴 블록에는 절대 닿지 않음). sectionKey=절 스코프 */
export async function saveDraft(
  docId: number,
  md: string,
  sectionKey: string | null = null
): Promise<void> {
  const session = await requireSession();
  // 작성자의 직군 = 프로젝트 멤버십 4직군(없으면 계정 역할 폴백)
  const role = repo.getDocProjectRole(docId, session.uid) ?? session.role;
  repo.saveDraft(docId, { id: session.uid, role }, md, asSection(sectionKey));
  revalidatePath(`/doc/${docId}`);
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
 * AI 개선 제안 (초안 단계, 비차단 — 보내기와 독립):
 * 제안 시점의 초안을 먼저 저장(upsert)해 보존한 뒤 suggest() 호출.
 * 수락 플로우는 클라이언트에서 선택 옵션을 초안 텍스트에 병합 →
 * 기존 saveDraft/sendBlock 경로를 그대로 사용한다 (작성자가 확인 후 보내기).
 */
export async function requestSuggestions(
  docId: number,
  draftMd: string,
  sectionKey: string | null = null
): Promise<SuggestResult> {
  const session = await requireSession();
  if (draftMd.trim().length === 0) {
    return { ok: false, error: "빈 초안에는 제안을 생성할 수 없습니다." };
  }
  try {
    const role = repo.getDocProjectRole(docId, session.uid) ?? session.role;
    repo.saveDraft(docId, { id: session.uid, role }, draftMd, asSection(sectionKey));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  // suggest는 throw하지 않는 규약 — {ok:false} 그대로 클라이언트에 전달
  return suggest(draftMd);
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

/**
 * 절 증류 — 그 절의 대화를 백서 산문으로 1회 증류해 저장한다.
 * 캐시: 같은 대화 시그니처면 AI를 다시 호출하지 않고 cached로 반환한다.
 */
export async function distillSectionAction(
  docId: number,
  sectionKey: string
): Promise<{ ok: true; cached: boolean } | { ok: false; error: string }> {
  const session = await requireSession();
  const sec = asSection(sectionKey);
  if (!sec) return { ok: false, error: "알 수 없는 절입니다." };

  // 권한 — 프로젝트 멤버이면서 편집자 이상
  const projectId = repo.getProjectIdForDoc(docId);
  if (projectId != null) {
    const m = repo.getMembership(projectId, session.uid);
    if (!m || (m.perm !== "owner" && m.perm !== "editor")) {
      return { ok: false, error: "증류 권한이 없습니다 (편집자 이상)." };
    }
  }

  const blocks = repo.getSectionConversation(docId, sec);
  if (blocks.length === 0)
    return { ok: false, error: "증류할 대화가 없습니다." };

  const sig = repo.sectionSourceSig(docId, sec);
  const existing = repo.getDistilledItem(docId, sec);
  if (existing && existing.sourceSig === sig) {
    return { ok: true, cached: true }; // 캐시 — AI 재호출 없음
  }

  const result = await distillSectionAI(
    blocks.map((b) => ({ sourceMd: b.sourceMd, authorRole: b.authorRole })),
    sectionLabel(sec)
  );
  if (!result.ok) return { ok: false, error: result.error };

  repo.upsertDistilledSection(docId, sec, {
    title: result.title,
    bodyMd: result.bodyMd,
    sig,
  });
  // 릴리스 스냅샷 append-only — 이번 합의로 무엇이 확정됐는지 박제
  repo.addReleaseEntry(docId, {
    sectionKey: sec,
    title: result.title,
    bodyMd: result.bodyMd,
    createdBy: session.uid,
  });
  revalidatePath(`/doc/${docId}`);
  return { ok: true, cached: false };
}
