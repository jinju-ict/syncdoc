"use client";

/**
 * 문서 최상단 고정 표지 + 승인 컨트롤 (Wave3 #5).
 *
 * 상태 분기 (계획 §abstracts 다행 히스토리 / Iteration 1 BLOCKING-3):
 * - 양측 승인 + 이번 합의의 abstracts 행 존재 → "✅ 합의됨" 표지 (양측 승인 시각 표기)
 * - abstracts 행은 있으나 승인이 해제됨(새 블록 추가) → "이전 합의 시점(stale)" 배지로 유지
 * - 양측 승인됐는데 이번 합의의 행이 없음(생성 실패) → 재시도 배너 (양측 누구나 가능)
 * - 승인 패널: 기획자/개발자 각자의 ✅/⬜ 상태 + 본인 역할이 미승인이면 동의 버튼
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AbstractInfo, Role } from "@/lib/repo";
import {
  approveDocument,
  retryAbstract,
} from "@/app/doc/[id]/approval-actions";
import Markdown from "./Markdown";

const roleLabel: Record<Role, string> = {
  planner: "기획자",
  developer: "개발자",
};

/** ISO(UTC) → "YYYY-MM-DD HH:mm" 결정적 표기 — SSR/CSR 하이드레이션 불일치 방지 */
function formatTs(ts: string): string {
  return ts.replace("T", " ").slice(0, 16);
}

export default function AbstractHeader({
  abstract,
  approvalPlannerAt,
  approvalDeveloperAt,
  docId,
  viewerRole,
  readOnly = false,
}: {
  abstract: AbstractInfo | null;
  approvalPlannerAt: string | null;
  approvalDeveloperAt: string | null;
  docId: number;
  viewerRole: Role;
  /** 보관된 문서 — 동의/재시도 등 모든 변경 컨트롤 숨김 */
  readOnly?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const bothApproved = Boolean(approvalPlannerAt && approvalDeveloperAt);
  // 최종 승인 시각 — ISO(UTC) 문자열이라 사전식 비교가 시간 비교와 동일
  const approvedAt = bothApproved
    ? approvalPlannerAt! > approvalDeveloperAt!
      ? approvalPlannerAt!
      : approvalDeveloperAt!
    : null;
  // 이번 합의에 대한 표지인가? (승인 해제됐거나 행이 더 오래되면 stale)
  const isFresh = Boolean(
    abstract && approvedAt && abstract.generatedAt >= approvedAt
  );
  // 합의는 됐지만 이번 합의의 표지가 없음 → 생성 실패 상태, 재시도 노출
  const needsRetry = bothApproved && !isFresh;

  const viewerApprovedAt =
    viewerRole === "planner" ? approvalPlannerAt : approvalDeveloperAt;
  const otherApprovedAt =
    viewerRole === "planner" ? approvalDeveloperAt : approvalPlannerAt;

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className="mb-8">
      {/* 승인 상태 패널 */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          문서 합의
        </span>
        <ApprovalMark role="planner" approvedAt={approvalPlannerAt} />
        <ApprovalMark role="developer" approvedAt={approvalDeveloperAt} />
        {bothApproved && isFresh && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            ✅ 합의됨
          </span>
        )}
        {!viewerApprovedAt && !readOnly && (
          <button
            type="button"
            onClick={() => run(() => approveDocument(docId))}
            disabled={isPending}
            className="ml-auto rounded-md border border-gray-900 bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isPending
              ? otherApprovedAt
                ? "합의 완료 — 표지 생성 중…"
                : "처리 중…"
              : `${roleLabel[viewerRole]}로 동의`}
          </button>
        )}
      </div>

      {/* 양측 합의됐으나 표지 생성 실패 → 재시도 (승인 롤백 없음, 양측 누구나) */}
      {needsRetry && !readOnly && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-xs text-amber-700">
            양측이 합의했지만 Abstract/TOC 표지가 아직 생성되지 않았습니다.
          </span>
          <button
            type="button"
            onClick={() => run(() => retryAbstract(docId))}
            disabled={isPending}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {isPending ? "생성 중…" : "재시도"}
          </button>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {/* 표지 — 최신 abstracts 행. 승인 해제 후에도 stale 배지와 함께 유지 */}
      {abstract && (
        <section
          className={`rounded-lg border p-5 ${
            isFresh
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-gray-200 bg-white"
          }`}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Abstract</h2>
            {isFresh ? (
              <>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  ✅ 합의됨
                </span>
                <span className="text-[11px] text-gray-500">
                  기획자 {formatTs(approvalPlannerAt!)} · 개발자{" "}
                  {formatTs(approvalDeveloperAt!)} 동의
                </span>
              </>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                이전 합의 시점
              </span>
            )}
          </div>
          <Markdown>{abstract.abstractMd}</Markdown>
          <div className="mt-4 border-t border-gray-200/70 pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              목차
            </h3>
            <Markdown>{abstract.tocMd}</Markdown>
          </div>
          <p className="mt-3 text-right text-[11px] text-gray-400">
            표지 생성 {formatTs(abstract.generatedAt)}
          </p>
        </section>
      )}
    </div>
  );
}

function ApprovalMark({
  role,
  approvedAt,
}: {
  role: Role;
  approvedAt: string | null;
}) {
  return (
    <span
      className={approvedAt ? "text-emerald-600" : "text-gray-400"}
      title={approvedAt ? `${formatTs(approvedAt)} 동의` : "미승인"}
    >
      {approvedAt ? "✅" : "⬜"} {roleLabel[role]}
    </span>
  );
}
