"use client";

/**
 * 문서 활동 배너 — 보관/해제 이력을 "누가·언제" 눈에 띄게 노출한다.
 * 몰래 다시 여는 행위 방지용(감사 로그의 가시화). 이력은 append-only라 위조 불가.
 * - 보관됨: 읽기 전용 안내 + 마지막 보관자.
 * - 활성인데 해제 이력 있음: "다시 열림 · 누가 · 언제".
 * - 전체 이력은 토글로 펼쳐 본다.
 */

import { useState } from "react";
import type { DocActivity, Lang } from "@/lib/repo";
import { roleLabelL } from "@/lib/i18n";

const L = {
  archived: { ko: "보관됨", en: "Archived", ja: "アーカイブ済み" },
  readOnly: {
    ko: "읽기 전용으로 보존됩니다.",
    en: "Preserved as read-only.",
    ja: "読み取り専用で保存されます。",
  },
  reopened: { ko: "다시 열림", en: "Reopened", ja: "再オープン" },
  actArchived: { ko: "보관", en: "archived", ja: "アーカイブ" },
  actUnarchived: { ko: "해제", en: "reopened", ja: "再オープン" },
  history: { ko: "전체 이력", en: "Full history", ja: "全履歴" },
  hide: { ko: "접기", en: "Hide", ja: "閉じる" },
} as const;

function fmt(ts: string): string {
  return ts.replace("T", " ").slice(0, 16);
}

export default function DocActivityBanner({
  activity,
  archived,
  lang = "ko",
}: {
  activity: DocActivity[];
  archived: boolean;
  lang?: Lang;
}) {
  const [open, setOpen] = useState(false);
  const tx = (k: keyof typeof L) => L[k][lang] ?? L[k].ko;

  const latest = activity[0] ?? null;
  // 활성 상태인데 활동 이력이 아예 없으면(한 번도 보관/해제 안 됨) 배너 없음.
  if (!archived && !latest) return null;

  const headline = archived
    ? { icon: "📦", label: tx("archived"), tone: "gray" as const }
    : { icon: "🔓", label: tx("reopened"), tone: "amber" as const };

  const who = (a: DocActivity) =>
    `${a.actorName} · ${roleLabelL(a.actorRole, lang)}`;

  const box =
    headline.tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-gray-300 bg-gray-50 text-gray-600";

  return (
    <div className={`mb-6 rounded-md border px-4 py-2.5 text-sm ${box}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold">
          {headline.icon} {headline.label}
        </span>
        {latest && (
          <span className="text-[13px] opacity-90">
            {who(latest)} · {fmt(latest.createdAt)}
          </span>
        )}
        {archived && <span className="text-[13px] opacity-80">— {tx("readOnly")}</span>}
        {activity.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto text-[12px] font-medium underline-offset-2 hover:underline"
          >
            {open ? tx("hide") : `${tx("history")} (${activity.length})`}
          </button>
        )}
      </div>

      {open && activity.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-current/15 pt-2 text-[12.5px]">
          {activity.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-1.5">
              <span className="font-medium">
                {a.action === "archived" ? tx("actArchived") : tx("actUnarchived")}
              </span>
              <span className="opacity-90">· {who(a)}</span>
              <span className="opacity-70">· {fmt(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
