"use client";

/**
 * 백서 절 교정 (편집자) — 이 절에 분류된 출처 메시지를 보고, 잘못 들어간 것을
 * 제외하거나 다른 절로 재분류한다. 변경하면 해당 절이 자동 재증류된다.
 * 채팅은 단순하게 유지하고, 교정은 여기(백서 화면)에서만.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang, ProjectRole, SectionSourceMessage } from "@/lib/repo";
import { correctSectionMessage } from "@/app/doc/[id]/actions";
import { roleLabelL } from "@/lib/i18n";

const SECTIONS: { key: string; ko: string; en: string; ja: string }[] = [
  { key: "why", ko: "목적", en: "Why", ja: "目的" },
  { key: "what", ko: "결과물", en: "What", ja: "成果" },
  { key: "how", ko: "방식", en: "How", ja: "方式" },
  { key: "rules", ko: "규칙", en: "Rules", ja: "規則" },
];

const L = {
  sources: { ko: "출처 메시지", en: "Source messages", ja: "出典メッセージ" },
  hide: { ko: "닫기", en: "Hide", ja: "閉じる" },
  exclude: { ko: "제외", en: "Exclude", ja: "除外" },
  include: { ko: "되돌리기", en: "Restore", ja: "戻す" },
  moveHint: { ko: "다른 절로", en: "Move to", ja: "他の節へ" },
} as const;

export default function SectionCuration({
  docId,
  sectionKey,
  messages,
  lang = "ko",
}: {
  docId: number;
  sectionKey: string;
  messages: SectionSourceMessage[];
  lang?: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const router = useRouter();
  const tx = (k: keyof typeof L) => L[k][lang] ?? L[k].ko;
  const secLabel = (key: string) => {
    const s = SECTIONS.find((x) => x.key === key);
    return s ? (s[lang] ?? s.ko) : key;
  };

  if (messages.length === 0) return null;

  const run = (messageId: number, change: { excluded?: boolean; section?: string | null }) =>
    startTransition(async () => {
      await correctSectionMessage(docId, messageId, change);
      router.refresh();
    });

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 600, color: "#8A857A" }}
      >
        {open ? `▾ ${tx("hide")}` : `▸ ${tx("sources")} ${messages.length}`}
      </button>

      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 9,
                border: "1px solid #ECE9E1",
                background: m.excluded ? "#FBF7F2" : "#fff",
                opacity: m.excluded ? 0.6 : 1,
              }}
            >
              <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, color: "#9A958A" }}>
                {roleLabelL(m.authorRole as ProjectRole, lang)}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12,
                  color: "#4A463E",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textDecoration: m.excluded ? "line-through" : "none",
                }}
              >
                {m.snippet}
              </span>
              <select
                value={sectionKey}
                disabled={busy}
                onChange={(e) => run(m.id, { section: e.target.value })}
                title={tx("moveHint")}
                style={{ flexShrink: 0, fontSize: 11, color: "#6E6A60", border: "1px solid #E0DCD2", borderRadius: 7, padding: "2px 4px", background: "#fff" }}
              >
                {SECTIONS.map((s) => (
                  <option key={s.key} value={s.key}>{s[lang] ?? s.ko}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(m.id, { excluded: !m.excluded })}
                style={{ flexShrink: 0, fontFamily: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer", borderRadius: 7, padding: "3px 8px", border: "1px solid", borderColor: m.excluded ? "#C9D6F6" : "#E8C9BD", background: "#fff", color: m.excluded ? "#2D4FD4" : "#A1462F" }}
              >
                {m.excluded ? tx("include") : tx("exclude")}
              </button>
            </div>
          ))}
          <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "#B0AB9F" }}>
            {secLabel(sectionKey)} · {lang === "en" ? "changes re-distill this section automatically" : lang === "ja" ? "変更すると自動で再蒸留されます" : "변경하면 이 절이 자동으로 다시 정리됩니다"}
          </p>
        </div>
      )}
    </div>
  );
}
