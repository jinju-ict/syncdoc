"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { translate } from "@/lib/ai";

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
    const result = await translate(sent.sourceMd, sent.targetRole);
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
