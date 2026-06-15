/**
 * 문서 렌즈 탭 바 (서버) — 대화 / 백서. URL 기반 전환.
 * - 대화(conv): 채팅방 = 입력. 팀이 대화하고 파일을 주고받는 곳.
 * - 백서(paper): 목차 있는 산문 문서 = 출력. AI가 대화에서 자동 정리한다.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import type { Lang } from "@/lib/repo";
import { t } from "@/lib/i18n";

type Lens = "paper" | "conv";

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
  caption,
  lang = "ko",
  children,
}: {
  docId: number;
  activeLens: Lens;
  caption: string;
  lang?: Lang;
  children: ReactNode;
}) {
  const icons: Record<Lens, ReactNode> = {
    conv: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z" />
      </svg>
    ),
    paper: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  };
  const tabs: { key: Lens; label: string; href: string }[] = [
    { key: "conv", label: t(lang, "lens.conv"), href: `/doc/${docId}?lens=conv` },
    { key: "paper", label: t(lang, "lens.paper"), href: `/doc/${docId}` },
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
          {tabs.map((tb) => (
            <Link key={tb.key} href={tb.href} style={tab(tb.key === activeLens)}>
              {icons[tb.key]}
              {tb.label}
            </Link>
          ))}
        </span>
      </div>

      {children}
    </div>
  );
}
