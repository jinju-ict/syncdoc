"use client";

/**
 * 데이터 렌즈 (RAG) — 백서가 어떻게 검색 가능한 구조 데이터가 되는지 보여준다.
 * ① 메타데이터 질의(데모: 임베딩이 아니라 키·상태 필터) ② 청크 시각화 ③ 스키마 JSON.
 */

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Lang } from "@/lib/repo";
import { t } from "@/lib/i18n";

const MONO = "var(--font-jetbrains), monospace";

export type DataChunk = {
  key: string;
  sectionTitle: string;
  kind: string;
  status: "agreed" | "discussing" | "draft" | "empty";
  tokens: number;
  title: string;
  preview: string;
};

function statusStyle(status: DataChunk["status"]): CSSProperties {
  if (status === "agreed") return { color: "#1B7F45", background: "#E8F5EC", border: "1px solid #D3EBDC" };
  if (status === "empty") return { color: "#9A958A", background: "#F0EEE7", border: "1px solid #E2DDD1" };
  if (status === "draft") return { color: "#6E6A60", background: "#F0EEE7", border: "1px solid #E2DDD1" };
  return { color: "#2D4FD4", background: "#EDF1FE", border: "1px solid #D7E0F8" };
}
function statusLabelL(status: DataChunk["status"], lang: Lang): string {
  if (status === "empty") return lang === "en" ? "Empty" : lang === "ja" ? "未作成" : "작성 전";
  return t(lang, status);
}

const chip: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  borderRadius: 5,
  padding: "1px 7px",
};

export default function DataLens({
  chunks,
  schemaJson,
  lang = "ko",
}: {
  chunks: DataChunk[];
  schemaJson: string;
  lang?: Lang;
}) {
  const [q, setQ] = useState<string | null>(null);
  const QUERIES: { id: string; label: string }[] = [
    { id: "agreed", label: t(lang, "data.qAgreed") },
    { id: "discussing", label: t(lang, "data.qDiscussing") },
    { id: "empty", label: t(lang, "data.qEmpty") },
    { id: "counts", label: t(lang, "data.qCounts") },
  ];

  function answer(id: string): string {
    if (id === "agreed") {
      const keys = chunks.filter((c) => c.status === "agreed").map((c) => c.key);
      return keys.length ? keys.join(", ") : "(합의된 항목 없음)";
    }
    if (id === "discussing") {
      const keys = chunks.filter((c) => c.status === "discussing").map((c) => c.key);
      return keys.length ? keys.join(", ") : "(논의 중 항목 없음)";
    }
    if (id === "empty") {
      const keys = chunks.filter((c) => c.status === "empty").map((c) => c.key);
      return keys.length ? keys.join(", ") : "(빈 절 없음 — 모든 절 작성됨)";
    }
    // counts
    const bySection = new Map<string, number>();
    for (const c of chunks) {
      if (c.status === "empty") continue;
      bySection.set(c.sectionTitle, (bySection.get(c.sectionTitle) ?? 0) + 1);
    }
    return [...bySection.entries()].map(([s, n]) => `${s}: ${n}`).join(" · ") || "(항목 없음)";
  }

  return (
    <section style={{ maxWidth: 940, width: "100%", margin: "0 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-instrument), 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", margin: "0 0 4px" }}>{t(lang, "data.title")}</h2>
        <p style={{ fontSize: 13.5, color: "#8A857A", margin: 0 }}>{t(lang, "data.sub")}</p>
      </div>

      {/* 질의 */}
      <div style={{ background: "#fff", border: "1px solid #E9E6DE", borderRadius: 14, padding: "16px 18px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 10px" }}>{t(lang, "data.query")}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {QUERIES.map((query) => {
            const active = q === query.id;
            return (
              <button
                key={query.id}
                onClick={() => setQ(active ? null : query.id)}
                style={{
                  fontFamily: "inherit",
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  borderRadius: 9,
                  padding: "6px 12px",
                  border: `1px solid ${active ? "#C9D6F6" : "#E0DCD2"}`,
                  background: active ? "#EDF1FE" : "#fff",
                  color: active ? "#2D4FD4" : "#6E6A60",
                }}
              >
                {query.label}
              </button>
            );
          })}
          {q && (
            <button onClick={() => setQ(null)} style={{ background: "none", border: 0, fontFamily: "inherit", cursor: "pointer", fontSize: 12, color: "#A8A296" }}>
              {t(lang, "data.clear")}
            </button>
          )}
        </div>
        {q && (
          <div style={{ marginTop: 12, display: "flex", gap: 9, alignItems: "flex-start", background: "#F8F9FE", border: "1px solid #D7E0F8", borderRadius: 11, padding: "11px 14px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2D4FD4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <span style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: "#2D4FD4", wordBreak: "break-all" }}>{answer(q)}</span>
          </div>
        )}
      </div>

      {/* 청크 */}
      <div style={{ background: "#FCFBF8", border: "1px solid #E9E6DE", borderRadius: 14, padding: "16px 18px" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 12px" }}>
          {t(lang, "data.chunks")} · {chunks.length}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {chunks.map((c) => (
            <div key={c.key} style={{ background: "#fff", border: "1px solid #EEEBE3", borderRadius: 11, padding: "11px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 6 }}>
                <span style={{ ...chip, color: "#2D4FD4", background: "#EDF1FE", fontWeight: 600 }}>{c.key}</span>
                <span style={{ ...chip, color: "#8A857A", background: "#F0EEE7" }}>{c.kind}</span>
                <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 99, padding: "1px 8px", ...statusStyle(c.status) }}>{statusLabelL(c.status, lang)}</span>
                <span style={{ marginInlineStart: "auto", fontFamily: MONO, fontSize: 10.5, color: "#B7B1A4" }}>~{c.tokens} tok</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "#34322C", margin: 0 }}>
                <strong style={{ fontWeight: 700 }}>{c.title}</strong>
                {c.preview ? <span style={{ color: "#8A857A" }}> — {c.preview}</span> : null}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 스키마 JSON */}
      <div style={{ background: "#1A1C20", borderRadius: 14, padding: "16px 18px", overflow: "hidden" }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8A91A0", margin: "0 0 10px" }}>{t(lang, "data.schema")}</p>
        <pre style={{ margin: 0, overflowX: "auto", fontFamily: MONO, fontSize: 11.5, lineHeight: 1.6, color: "#C7D0DE", whiteSpace: "pre" }}>{schemaJson}</pre>
      </div>
    </section>
  );
}
