import type { AbstractInfo, Role } from "@/lib/repo";
import Markdown from "./Markdown";

/**
 * 승인 후 문서 최상단에 고정되는 Abstract/TOC 표지 — 현재 placeholder.
 *
 * NOTE(worker-abstract): 이 컴포넌트 내부만 교체하면 된다.
 * - 양측 동의 버튼 → setApproval → 양측 완료 시 abstract() → addAbstract
 *   서버 액션을 app/doc/[id]/actions.ts에 추가해 사용할 것.
 * - 승인 해제 후에도 최신 abstract 행은 "이전 합의 시점(stale)" 배지와 함께 유지.
 * - abstract() 실패 시 승인 상태는 유지하고 재시도 버튼 노출 (승인 롤백 없음).
 */
export default function AbstractHeader({
  abstract,
  approvalPlannerAt,
  approvalDeveloperAt,
  docId,
  viewerRole,
}: {
  abstract: AbstractInfo | null;
  approvalPlannerAt: string | null;
  approvalDeveloperAt: string | null;
  docId: number;
  viewerRole: Role;
}) {
  void docId;
  void viewerRole;

  if (!abstract) return null;

  const isStale = !(approvalPlannerAt && approvalDeveloperAt);

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-700">Abstract</h2>
        {isStale && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
            이전 합의 시점
          </span>
        )}
      </div>
      <Markdown>{abstract.abstractMd}</Markdown>
      <div className="mt-4 border-t border-gray-100 pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          목차
        </h3>
        <Markdown>{abstract.tocMd}</Markdown>
      </div>
    </section>
  );
}
