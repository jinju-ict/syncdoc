/**
 * 문서 렌즈 탭 바 (서버) — 백서 / 나란히 / 대화. URL 기반 전환.
 * - 백서: 목차 있는 산문 문서 (읽기)
 * - 나란히: 한 절의 본문 + 그 절의 대화
 * - 대화: 전체 대화 타임라인 + 작성기 + 댓글
 *
 * 절 드릴인은 백서/합의현황의 "대화 이어가기" 링크가 ?lens=side&sec=KEY로 들어온다.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import type { SectionKey } from "@/lib/sections";
import type { Lang } from "@/lib/repo";
import { t } from "@/lib/i18n";

type Lens = "paper" | "side" | "conv" | "data";

const tabBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "inherit",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 9,
  padding: "6px 13px",
  cursor: "pointer",
  textDecoration: "none",
};

export default function DocLensShell({
  docId,
  activeLens,
  sec,
  caption,
  lang = "ko",
  children,
}: {
  docId: number;
  activeLens: Lens;
  /** 현재 나란히 렌즈의 절 (없으면 나란히 탭은 기본 'why'로 이동) */
  sec?: SectionKey;
  caption: string;
  lang?: Lang;
  children: ReactNode;
}) {
  const sideSec: SectionKey = sec ?? "why";
  const icons: Record<Lens, ReactNode> = {
    paper: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
    side: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="7" height="16" rx="1" />
        <rect x="14" y="4" width="7" height="16" rx="1" />
      </svg>
    ),
    conv: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z" />
      </svg>
    ),
    data: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    ),
  };
  const tabs: { key: Lens; label: string; href: string }[] = [
    { key: "paper", label: t(lang, "lens.paper"), href: `/doc/${docId}` },
    { key: "side", label: t(lang, "lens.side"), href: `/doc/${docId}?lens=side&sec=${sideSec}` },
    { key: "conv", label: t(lang, "lens.conv"), href: `/doc/${docId}?lens=conv` },
    { key: "data", label: t(lang, "lens.data"), href: `/doc/${docId}?lens=data` },
  ];

  const tab = (active: boolean): CSSProperties => ({
    ...tabBase,
    background: active ? "#EDF1FE" : "#fff",
    color: active ? "#2D4FD4" : "#6E6A60",
    border: `1px solid ${active ? "#C9D6F6" : "#E0DCD2"}`,
  });

  return (
    <div
      style={{
        fontFamily:
          "var(--font-instrument), 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          position: "sticky",
          top: 58,
          zIndex: 20,
          background: "#fff",
          padding: "12px 16px",
          margin: "0 0 24px",
          border: "1px solid #E9E6DE",
          borderRadius: 13,
          boxShadow: "0 10px 22px -14px rgba(40,36,26,0.28), 0 1px 0 #F0EDE6",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#8A857A" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8A857A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3c2.5 2.6 4 5.7 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.7-4-9s1.5-6.4 4-9z" />
          </svg>
          {caption}
        </span>
        <span style={{ marginInlineStart: "auto", display: "flex", gap: 7 }}>
          {tabs.map((t) => (
            <Link key={t.key} href={t.href} style={tab(t.key === activeLens)}>
              {icons[t.key]}
              {t.label}
            </Link>
          ))}
        </span>
      </div>

      {children}
    </div>
  );
}
