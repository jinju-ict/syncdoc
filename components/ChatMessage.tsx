"use client";

/**
 * 채팅 메시지 버블 (v0.2 채팅 렌즈).
 * - 기본: 작성자의 **원문 메시지**를 그대로 보여준다 (대화 = 사실 그대로).
 * - 다른 사람 메시지는 "내 수준으로 보기" 토글 시 내 (직군×언어×숙련도)에 맞춰
 *   적응된 번역으로 바뀐다. 다시 누르면 원문으로 돌아온다.
 * - 내 메시지(authorId === viewerId)는 토글 없이 원문만 (내가 쓴 글).
 * 잠긴 블록은 불변 — 메시지는 수정/삭제되지 않는다 (대화 = append-only).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang, MessageRelevanceView, ProjectRole, TimelineBlock } from "@/lib/repo";
import { retryTranslation, correctMessageClassification } from "@/app/doc/[id]/actions";
import { roleLabelL } from "@/lib/i18n";
import Markdown from "./Markdown";

/** 절 칩 — 분류 결과를 짧게 표시 (정식 절 제목은 sectionTitleL, 여기선 압축) */
const SECTION_CHIP: Record<string, { ko: string; en: string; ja: string; c: string; bg: string }> = {
  why: { ko: "목적", en: "Why", ja: "目的", c: "#6D4FC8", bg: "#F1EDFB" },
  what: { ko: "결과물", en: "What", ja: "成果", c: "#0D7E74", bg: "#E6F4F2" },
  how: { ko: "방식", en: "How", ja: "方式", c: "#2D6FB0", bg: "#E7F0F8" },
  rules: { ko: "규칙", en: "Rules", ja: "規則", c: "#C2410C", bg: "#FBEEE4" },
};
const SECTION_ORDER = ["why", "what", "how", "rules"] as const;

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
  classifying: { ko: "분류 중…", en: "Classifying…", ja: "分類中…" },
  chat: { ko: "잡담", en: "Chat", ja: "雑談" },
  auto: { ko: "자동", en: "Auto", ja: "自動" },
  pin: { ko: "백서 반영", en: "Pin to doc", ja: "白書に反映" },
  pinned: { ko: "반영됨", en: "Pinned", ja: "反映済" },
  exclude: { ko: "제외", en: "Exclude", ja: "除外" },
  excluded: { ko: "제외됨", en: "Excluded", ja: "除外済" },
} as const;

function timeOf(ts: string): string {
  return ts.replace("T", " ").slice(11, 16);
}

export default function ChatMessage({
  block,
  relevance = null,
  canCurate = false,
  viewerId,
  viewerRole,
  viewerLang = "ko",
  docId,
  authorName,
  readOnly = false,
}: {
  block: TimelineBlock;
  relevance?: MessageRelevanceView | null;
  canCurate?: boolean;
  viewerId: number;
  viewerRole: ProjectRole;
  viewerLang?: Lang;
  docId: number;
  authorName: string;
  readOnly?: boolean;
}) {
  const [showAdapted, setShowAdapted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [curating, startCurate] = useTransition();
  const router = useRouter();
  const tx = (k: keyof typeof L) => L[k][viewerLang] ?? L[k].ko;

  const curate = (change: { pinned?: boolean; excluded?: boolean; section?: string | null }) =>
    startCurate(async () => {
      await correctMessageClassification(docId, block.id, change);
      router.refresh();
    });

  const excluded = relevance?.excluded ?? false;
  const pinned = relevance?.pinned ?? false;
  const sec = relevance?.sectionKey ?? null; // override ?? ai
  const classified = relevance?.classified ?? false;
  const chipDef = sec ? SECTION_CHIP[sec] : null;

  const own = block.authorId === viewerId;
  const av = ROLE_AV[block.authorRole];
  const translation = block.translation;
  const status = translation?.status ?? "failed";
  // 내 직군·한국어면 원문이 곧 내 언어판 — 적응 토글이 의미 없다
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
            {isPending ? tx("retrying") : tx("failedRetry")}
          </button>
        )}
      </div>
    );
  })();

  return (
    <div className={`flex gap-2.5 ${own ? "flex-row-reverse" : "flex-row"} ${excluded && canCurate ? "opacity-50" : ""}`}>
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

        {/* 분류·교정 (편집자 이상) — 어느 절로 갈지 + 핀/제외 + 재분류 */}
        {canCurate && (
          <div className={`mt-1 flex flex-wrap items-center gap-1 ${own ? "justify-end" : ""}`}>
            {!classified ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] text-gray-400">{tx("classifying")}</span>
            ) : chipDef ? (
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: chipDef.c, background: chipDef.bg }}>
                {chipDef[viewerLang] ?? chipDef.ko}
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] text-gray-400">{tx("chat")}</span>
            )}
            <select
              value={sec ?? ""}
              onChange={(e) => curate({ section: e.target.value === "" ? null : e.target.value })}
              disabled={curating}
              className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10.5px] text-gray-500 focus:outline-none"
              title={tx("auto")}
            >
              <option value="">{tx("auto")}</option>
              {SECTION_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SECTION_CHIP[s][viewerLang] ?? SECTION_CHIP[s].ko}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => curate({ pinned: !pinned })}
              disabled={curating}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${pinned ? "bg-[#EDF1FE] text-[#2D4FD4]" : "text-gray-400 hover:text-gray-700"}`}
            >
              📌 {pinned ? tx("pinned") : tx("pin")}
            </button>
            <button
              type="button"
              onClick={() => curate({ excluded: !excluded })}
              disabled={curating}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${excluded ? "bg-amber-50 text-amber-700" : "text-gray-400 hover:text-gray-700"}`}
            >
              {excluded ? tx("excluded") : tx("exclude")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
