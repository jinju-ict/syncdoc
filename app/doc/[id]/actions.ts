"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { translate, suggest } from "@/lib/ai";
import type { SuggestResult } from "@/lib/ai";

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * 트랜잭션 밖 번역 실행: translate() 호출 → 결과를 조건부 UPDATE로 기록.
 * translate는 throw하지 않는 규약이지만, 만약을 위해 실패도 흡수한다.
 */
async function runTranslation(sent: repo.SentBlock): Promise<void> {
  try {
    // 독자(상대 역할 사용자)의 현재 레벨을 호출 시점에 조회해 표현 수준을 맞춘다
    const targetLevel = repo.getLevelForRole(sent.targetRole);
    const result = await translate(sent.sourceMd, sent.targetRole, targetLevel);
    repo.recordTranslation(
      sent.blockId,
      result.ok ? { ok: true, md: result.md } : { ok: false, error: result.error }
    );
  } catch (e) {
    repo.recordTranslation(sent.blockId, { ok: false, error: String(e) });
  }
}

/** 초안 임시 저장 (upsert — 잠긴 블록에는 절대 닿지 않음) */
export async function saveDraft(docId: number, md: string): Promise<void> {
  const session = await requireSession();
  repo.saveDraft(docId, { id: session.uid, role: session.role }, md);
  revalidatePath(`/doc/${docId}`);
}

/**
 * '보내기': 초안 저장 → repo.sendBlock(단일 트랜잭션: 잠금 + pending 번역
 * 선삽입 + 승인 해제) → 응답 후 fire-and-forget으로 번역 실행.
 */
export async function sendBlock(
  docId: number,
  md: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  let sent: repo.SentBlock;
  try {
    const blockId = repo.saveDraft(
      docId,
      { id: session.uid, role: session.role },
      md
    );
    sent = repo.sendBlock(blockId, session.uid);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/doc/${docId}`);
  after(() => runTranslation(sent));
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
  draftMd: string
): Promise<SuggestResult> {
  const session = await requireSession();
  if (draftMd.trim().length === 0) {
    return { ok: false, error: "빈 초안에는 제안을 생성할 수 없습니다." };
  }
  try {
    repo.saveDraft(docId, { id: session.uid, role: session.role }, draftMd);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  // suggest는 throw하지 않는 규약 — {ok:false} 그대로 클라이언트에 전달
  return suggest(draftMd);
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

/** 번역 재시도: failed 또는 2분 초과 pending만 통과 (조건부 UPDATE로 경합 무해화) */
export async function retryTranslation(
  docId: number,
  blockId: number
): Promise<void> {
  await requireSession();
  const sent = repo.markTranslationRetry(blockId);
  if (sent) {
    revalidatePath(`/doc/${docId}`);
    after(() => runTranslation(sent));
  }
}
