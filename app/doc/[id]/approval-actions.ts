"use server";

/**
 * 승인 + Abstract Server Actions — actions.ts(worker-ai 소유)와 분리된 파일.
 *
 * 정책 (계획 §AI 계층 abstract / Iteration 1 BLOCKING-3):
 * - 양측 승인 완료 → abstract() 호출 → 성공 시 abstracts에 새 히스토리 행 INSERT.
 * - abstract() 실패 시 승인 상태는 유지하고 abstracts 행을 남기지 않는다
 *   (승인 롤백 없음 — 합의 사실과 표지 생성은 별개 사건). UI가 재시도 버튼 노출.
 * - 재시도는 양측 누구나 가능. 새 블록 '보내기' 시 승인 해제는 repo.sendBlock
 *   트랜잭션 내부에서 이미 수행되므로 여기서는 다루지 않는다.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { abstract } from "@/lib/ai";

export type ApprovalActionResult = { ok: true } | { ok: false; error: string };

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/start");
  return session;
}

/**
 * 양측 승인이 완료된 문서의 Abstract/TOC를 생성해 다행 히스토리에 추가한다.
 * 이번 합의(최종 승인 시각 이후)에 대한 표지가 이미 있으면 재생성하지 않는다.
 */
async function generateAbstractForDoc(
  docId: number
): Promise<ApprovalActionResult> {
  try {
    const doc = repo.getDocument(docId);
    if (!doc) return { ok: false, error: "문서를 찾을 수 없습니다." };
    // 합의 = 참여자(소유자·편집자) 전원 서명 (레거시 문서는 2축 폴백)
    const consensus = repo.getDocConsensus(docId);
    if (!consensus.agreed || !consensus.latestSignedAt)
      return { ok: false, error: "참여자 전원의 합의가 필요합니다." };

    // 최종 합의 시각 — ISO(UTC) 문자열이라 사전식 비교가 시간 비교와 동일
    const approvedAt = consensus.latestSignedAt;

    const latest = repo.getLatestAbstract(docId);
    if (latest && latest.generatedAt >= approvedAt) return { ok: true };

    const blocks = repo.getLockedBlocksForAbstract(docId);
    if (blocks.length === 0)
      return { ok: false, error: "분석할 잠긴 블록이 없습니다." };

    // abstract()는 throw하지 않는 규약 — 실패 시 승인 유지 + 행 미생성 (재시도 가능)
    const result = await abstract(blocks);
    if (!result.ok)
      return { ok: false, error: `표지 생성 실패: ${result.error}` };

    // 조건부 INSERT — 동시 재시도 경합 시 중복 행 방지
    repo.addAbstractIfMissingSince(
      docId,
      approvedAt,
      result.abstractMd,
      result.tocMd
    );
    revalidatePath(`/doc/${docId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 현재 사용자 역할의 동의 기록. 이로써 양측 승인이 완료되면 즉시 Abstract/TOC를
 * 생성한다 (생성 실패해도 승인은 유지 — 반환 에러는 표지 생성 실패만 의미).
 */
export async function approveDocument(
  docId: number
): Promise<ApprovalActionResult> {
  const session = await requireSession();

  try {
    // 동의 주체의 직군은 프로젝트 멤버십에서 결정(2축 매핑), 폴백은 계정 역할
    const role = repo.getDocRole(docId, session.uid) ?? session.role;
    repo.setApproval(docId, role); // 레거시 호환(2축) — 게이트는 서명 기반
    // 1인1서명 — 멤버십 4직군 표시값(없으면 2축 역할)으로 이 사용자의 합의를 기록
    const projectId = repo.getProjectIdForDoc(docId);
    const membership = projectId
      ? repo.getMembership(projectId, session.uid)
      : null;
    repo.addSignature(docId, session.uid, membership?.role ?? role);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/doc/${docId}`);

  // 참여자 전원 서명되면 표지 생성 (아니면 서명만 기록하고 종료)
  if (!repo.getDocConsensus(docId).agreed) return { ok: true };
  return generateAbstractForDoc(docId);
}

/**
 * 표지 생성 재시도 — 양측 승인은 되어 있으나 이번 합의의 abstracts 행이 없을 때.
 * 양측 누구나 트리거할 수 있다.
 */
export async function retryAbstract(
  docId: number
): Promise<ApprovalActionResult> {
  await requireSession();
  return generateAbstractForDoc(docId);
}
