"use client";

/**
 * 문서 최상단 고정 표지 + 합의 컨트롤.
 * 합의 = 참여자(소유자·편집자) 전원 서명 (레거시 문서는 2축 폴백, 서버가 판정).
 * - 참여자별 ✅/⬜ 서명 상태 + 본인 미서명 시 동의 버튼
 * - 전원 합의 + 이번 합의의 abstracts 행 존재 → "✅ 합의됨" 표지
 * - 행이 오래됨(새 블록으로 합의 해제) → "이전 합의 시점" 배지 유지
 * - 합의됐는데 이번 표지 없음(생성 실패) → 재시도
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AbstractInfo, DocConsensus, Lang } from "@/lib/repo";
import { roleLabelL } from "@/lib/i18n";
import { approveDocument, retryAbstract } from "@/app/doc/[id]/approval-actions";
import Markdown from "@/components/common/Markdown";

const L = {
  agreement: { ko: "문서 합의", en: "Agreement", ja: "合意" },
  agreed: { ko: "합의됨", en: "Agreed", ja: "合意済み" },
  approve: { ko: "동의", en: "Approve", ja: "同意" },
  approving: { ko: "처리 중…", en: "Submitting…", ja: "処理中…" },
  stale: { ko: "이전 합의 시점", en: "Previous agreement", ja: "以前の合意" },
  retryNote: {
    ko: "참여자가 모두 합의했지만 표지가 아직 생성되지 않았습니다.",
    en: "All participants agreed, but the cover hasn't been generated yet.",
    ja: "参加者全員が合意しましたが、表紙はまだ生成されていません。",
  },
  retry: { ko: "재시도", en: "Retry", ja: "再試行" },
  generating: { ko: "생성 중…", en: "Generating…", ja: "生成中…" },
  agreedCount: { ko: "명 합의", en: " agreed", ja: "名が合意" },
  coverGen: { ko: "표지 생성", en: "Cover generated", ja: "表紙生成" },
} as const;

function formatTs(ts: string): string {
  return ts.replace("T", " ").slice(0, 16);
}

export default function AbstractHeader({
  abstract,
  consensus,
  viewerId,
  lang = "ko",
  docId,
  readOnly = false,
}: {
  abstract: AbstractInfo | null;
  consensus: DocConsensus;
  viewerId: number;
  lang?: Lang;
  docId: number;
  readOnly?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const tx = (k: keyof typeof L) => L[k][lang] ?? L[k].ko;

  const { participants, agreed, latestSignedAt, legacy } = consensus;
  const isFresh = Boolean(
    abstract && latestSignedAt && abstract.generatedAt >= latestSignedAt
  );
  const needsRetry = agreed && !isFresh;
  const signedCount = participants.filter((p) => p.signedAt).length;

  const viewer = participants.find((p) => p.userId === viewerId);
  const viewerSigned = Boolean(viewer?.signedAt);
  const canSign = !readOnly && (legacy ? true : Boolean(viewer) && !viewerSigned);

  const run = (
    action: () => Promise<{ ok: true } | { ok: false; error: string }>
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div className="mb-8">
      {/* 합의 상태 패널 */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {tx("agreement")}
        </span>
        {participants.map((p) => (
          <span
            key={p.userId}
            className={p.signedAt ? "text-emerald-600" : "text-gray-400"}
            title={p.signedAt ? `${formatTs(p.signedAt)}` : "—"}
          >
            {p.signedAt ? "✅" : "⬜"} {p.name}
            <span className="text-gray-400"> ({roleLabelL(p.role, lang)})</span>
          </span>
        ))}
        {agreed && isFresh && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            ✅ {tx("agreed")}
          </span>
        )}
        {canSign && (
          <button
            type="button"
            onClick={() => run(() => approveDocument(docId))}
            disabled={isPending}
            className="ml-auto rounded-md border border-gray-900 bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isPending ? tx("approving") : tx("approve")}
          </button>
        )}
      </div>

      {/* 합의됐으나 표지 생성 실패 → 재시도 (참여자 누구나) */}
      {needsRetry && !readOnly && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-xs text-amber-700">{tx("retryNote")}</span>
          <button
            type="button"
            onClick={() => run(() => retryAbstract(docId))}
            disabled={isPending}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {isPending ? tx("generating") : tx("retry")}
          </button>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {/* 표지 — 최신 abstracts 행. 합의 해제 후에도 stale 배지와 함께 유지 */}
      {abstract && (
        <section
          className={`rounded-lg border p-5 ${
            isFresh ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"
          }`}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Abstract</h2>
            {isFresh ? (
              <>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  ✅ {tx("agreed")}
                </span>
                {!legacy && (
                  <span className="text-[11px] text-gray-500">
                    {signedCount}
                    {tx("agreedCount")}
                    {latestSignedAt ? ` · ${formatTs(latestSignedAt)}` : ""}
                  </span>
                )}
              </>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                {tx("stale")}
              </span>
            )}
          </div>
          <Markdown>{abstract.abstractMd}</Markdown>
          <div className="mt-4 border-t border-gray-200/70 pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              TOC
            </h3>
            <Markdown>{abstract.tocMd}</Markdown>
          </div>
          <p className="mt-3 text-right text-[11px] text-gray-400">
            {tx("coverGen")} {formatTs(abstract.generatedAt)}
          </p>
        </section>
      )}
    </div>
  );
}
