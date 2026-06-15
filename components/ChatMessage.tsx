"use client";

/**
 * 채팅 메시지 버블 (v0.2 채팅 렌즈).
 * - 내 메시지(authorId === viewerId): 오른쪽 정렬, 코발트 버블, 원문 그대로
 * - 다른 사람 메시지: 왼쪽 정렬, 흰 버블, 내 (직군×언어) 번역본 + 원문 토글
 * 잠긴 블록은 불변 — 메시지는 수정/삭제되지 않는다 (대화 = append-only).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang, ProjectRole, TimelineBlock } from "@/lib/repo";
import { retryTranslation } from "@/app/doc/[id]/actions";
import { roleLabelL } from "@/lib/i18n";
import Markdown from "./Markdown";

const ROLE_AV: Record<ProjectRole, { c: string; bg: string; bd: string }> = {
  planner: { c: "#6D4FC8", bg: "#F1EDFB", bd: "#E2DAF6" },
  developer: { c: "#0D7E74", bg: "#E6F4F2", bd: "#CDE7E2" },
  designer: { c: "#C2410C", bg: "#FBEEE4", bd: "#F1D9C5" },
  ops: { c: "#2D6FB0", bg: "#E7F0F8", bd: "#CFE0EE" },
};

function timeOf(ts: string): string {
  return ts.replace("T", " ").slice(11, 16);
}

export default function ChatMessage({
  block,
  viewerId,
  viewerRole,
  viewerLang = "ko",
  docId,
  authorName,
  readOnly = false,
}: {
  block: TimelineBlock;
  viewerId: number;
  viewerRole: ProjectRole;
  viewerLang?: Lang;
  docId: number;
  authorName: string;
  readOnly?: boolean;
}) {
  const [showSource, setShowSource] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const own = block.authorId === viewerId;
  const av = ROLE_AV[block.authorRole];
  const translation = block.translation;
  const status = translation?.status ?? "failed";
  // 내 직군이 작성자 직군과 같으면 번역 없이 원문이 곧 내 언어판(한국어 한정)
  const sameRoleSameLang = block.authorRole === viewerRole && viewerLang === "ko";
  const showTranslated = !own && !sameRoleSameLang;

  const retry = () =>
    startTransition(async () => {
      await retryTranslation(docId, block.id, viewerRole, viewerLang);
      router.refresh();
    });

  const body = (() => {
    if (!showTranslated) return <Markdown>{block.sourceMd}</Markdown>;
    if (status === "ok" && translation?.translatedMd)
      return <Markdown>{translation.translatedMd}</Markdown>;
    if (status === "pending")
      return (
        <p className="text-sm text-gray-400">
          <span className="mr-1 inline-block animate-pulse">●</span>
          {viewerLang === "en" ? "Translating…" : viewerLang === "ja" ? "翻訳中…" : "번역 중…"}
        </p>
      );
    // failed → 원문 + 재시도
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
            {isPending
              ? viewerLang === "en" ? "Retrying…" : viewerLang === "ja" ? "再試行中…" : "재시도 중…"
              : viewerLang === "en" ? "Translation failed · retry" : viewerLang === "ja" ? "翻訳失敗 · 再試行" : "번역 실패 · 재시도"}
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
              : "rounded-tl-sm border border-[#E9E6DE] bg-white text-[#34322C]"
          }`}
        >
          {body}
        </div>
        {showTranslated && status === "ok" && (
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="mt-1 text-[11px] text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
          >
            {showSource
              ? viewerLang === "en" ? "Hide original" : viewerLang === "ja" ? "原文を隠す" : "원문 접기"
              : viewerLang === "en" ? "Show original" : viewerLang === "ja" ? "原文を表示" : "원문 보기"}
          </button>
        )}
        {showTranslated && status === "ok" && showSource && (
          <div className="markdown-body mt-1 rounded-xl border border-gray-200 bg-[#FAF9F5] px-3 py-2 text-[13px] leading-6 text-gray-600">
            <Markdown>{block.sourceMd}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
