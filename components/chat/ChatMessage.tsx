"use client";

/**
 * 채팅 메시지 버블 (v0.2 채팅 렌즈) — 단순하게.
 * - 기본: 작성자의 **원문 메시지**를 그대로 보여준다.
 * - 다른 사람 메시지는 "내 수준으로 보기" 토글 시 내 (직군×언어×숙련도)에 맞춰
 *   적응된 번역으로 바뀐다. 다시 누르면 원문으로 돌아온다.
 * - 내 메시지(authorId === viewerId)는 토글 없이 원문만.
 * 분류·정리·백서 입력은 전부 뒤에서 AI가 자동 처리한다 — 채팅엔 교정 UI가 없다.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AttachmentInfo, Lang, ProjectRole, TimelineBlock } from "@/lib/repo";
import { retryTranslation } from "@/app/doc/[id]/actions";
import { roleLabelL } from "@/lib/i18n";
import Markdown from "@/components/common/Markdown";

const ROLE_AV: Record<ProjectRole, { c: string; bg: string; bd: string }> = {
  planner: { c: "#6D4FC8", bg: "#F1EDFB", bd: "#E2DAF6" },
  developer: { c: "#0D7E74", bg: "#E6F4F2", bd: "#CDE7E2" },
  designer: { c: "#C2410C", bg: "#FBEEE4", bd: "#F1D9C5" },
  ops: { c: "#2D6FB0", bg: "#E7F0F8", bd: "#CFE0EE" },
};

const L = {
  myLevel: { ko: "내 수준으로 보기", en: "View at my level", ja: "自分のレベルで見る" },
  original: { ko: "원문 보기", en: "Show original", ja: "原文を表示" },
  translating: { ko: "번역 중…", en: "Translating…", ja: "翻訳中…" },
  retrying: { ko: "재시도 중…", en: "Retrying…", ja: "再試行中…" },
  failedRetry: { ko: "번역 실패 · 재시도", en: "Translation failed · retry", ja: "翻訳失敗 · 再試行" },
} as const;

function timeOf(ts: string): string {
  return ts.replace("T", " ").slice(11, 16);
}

export default function ChatMessage({
  block,
  attachments = [],
  viewerId,
  viewerRole,
  viewerLang = "ko",
  docId,
  authorName,
  readOnly = false,
}: {
  block: TimelineBlock;
  attachments?: AttachmentInfo[];
  viewerId: number;
  viewerRole: ProjectRole;
  viewerLang?: Lang;
  docId: number;
  authorName: string;
  readOnly?: boolean;
}) {
  const [showAdapted, setShowAdapted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const tx = (k: keyof typeof L) => L[k][viewerLang] ?? L[k].ko;

  const own = block.authorId === viewerId;
  const av = ROLE_AV[block.authorRole];
  const translation = block.translation;
  const status = translation?.status ?? "failed";
  const sameRoleSameLang = block.authorRole === viewerRole && viewerLang === "ko";
  const canAdapt = !own && !sameRoleSameLang;

  const retry = () =>
    startTransition(async () => {
      await retryTranslation(docId, block.id, viewerRole, viewerLang);
      router.refresh();
    });

  // 기본은 원문. 다른 사람 메시지에서 "내 수준으로 보기"를 켜면 적응 번역으로 바뀐다.
  const body = (() => {
    if (!canAdapt || !showAdapted) return <Markdown>{block.sourceMd}</Markdown>;
    if (status === "ok" && translation?.translatedMd)
      return <Markdown>{translation.translatedMd}</Markdown>;
    if (status === "pending")
      return (
        <p className="text-sm text-gray-400">
          <span className="mr-1 inline-block animate-pulse">●</span>
          {tx("translating")}
        </p>
      );
    return (
      <div className="space-y-1.5">
        <Markdown>{block.sourceMd}</Markdown>
        {!readOnly && (
          <button
            type="button"
            onClick={retry}
            disabled={isPending}
            className="text-[11px] text-amber-700 underline-offset-2 hover:underline disabled:opacity-50"
          >
            {isPending ? tx("retrying") : tx("failedRetry")}
          </button>
        )}
      </div>
    );
  })();

  return (
    <div className={`flex gap-2.5 ${own ? "flex-row-reverse" : "flex-row"}`}>
      <span
        className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-xs font-bold"
        style={{ background: av.bg, color: av.c, border: `1px solid ${av.bd}` }}
        title={`${authorName} · ${roleLabelL(block.authorRole, viewerLang)}`}
      >
        {authorName.trim().charAt(0).toUpperCase()}
      </span>
      <div className={`flex min-w-0 max-w-[78%] flex-col ${own ? "items-end" : "items-start"}`}>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="font-semibold text-gray-500">{authorName}</span>
          <span style={{ color: av.c }}>{roleLabelL(block.authorRole, viewerLang)}</span>
          <span>· {timeOf(block.lockedAt)}</span>
        </div>
        <div
          className={`markdown-body rounded-2xl px-3.5 py-2 text-[14px] leading-7 ${
            own
              ? "rounded-tr-sm bg-[#2D4FD4] text-white [&_*]:text-white"
              : showAdapted
                ? "rounded-tl-sm border border-[#C9D6F6] bg-[#F2F5FE] text-[#34322C]"
                : "rounded-tl-sm border border-[#E9E6DE] bg-white text-[#34322C]"
          }`}
        >
          {body}
        </div>

        {/* 첨부 — 이미지는 미리보기, 그 외(PDF·파일)는 카드 + 다운로드 */}
        {attachments.length > 0 && (
          <div className={`mt-1.5 flex flex-col gap-1.5 ${own ? "items-end" : "items-start"}`}>
            {attachments.map((a) =>
              (a.mime ?? "").startsWith("image/") ? (
                <a key={a.id} href={`/doc/${docId}/file/${a.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/doc/${docId}/file/${a.id}`}
                    alt={a.title ?? "image"}
                    className="max-h-60 max-w-full rounded-xl border border-[#E9E6DE]"
                  />
                </a>
              ) : (
                <a
                  key={a.id}
                  href={`/doc/${docId}/file/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex max-w-[16rem] items-center gap-2 rounded-xl border border-[#E0DCD2] bg-white px-3 py-2 text-[13px] text-[#34322C] hover:border-[#9DB0E8]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6A60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                  </svg>
                  <span className="truncate">{a.title ?? "file"}</span>
                </a>
              )
            )}
          </div>
        )}

        {canAdapt && (
          <button
            type="button"
            onClick={() => setShowAdapted((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#2D4FD4] underline-offset-2 hover:underline"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9" /><path d="M3 4v5h5" />
            </svg>
            {showAdapted ? tx("original") : tx("myLevel")}
          </button>
        )}
      </div>
    </div>
  );
}
