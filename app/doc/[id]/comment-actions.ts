"use server";

/**
 * 댓글 Server Actions — actions.ts(worker-ai 소유)와 분리된 파일 (handoff 결정).
 *
 * 불변식은 repo 계층이 강제한다:
 * - 댓글은 locked 블록 전용 (repo.addComment가 throw)
 * - 빈 본문 거부 (repo.addComment가 throw)
 * 여기서는 세션 확인 + 에러를 {ok:false, error}로 변환해 UI에 전달만 한다.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";

export type CommentActionResult = { ok: true } | { ok: false; error: string };

/** 댓글/답글 작성 — parentId가 있으면 스레드 답글 */
export async function addComment(
  docId: number,
  blockId: number,
  body: string,
  parentId: number | null = null
): Promise<CommentActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  try {
    repo.addComment(blockId, session.uid, body, parentId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/doc/${docId}`);
  return { ok: true };
}
