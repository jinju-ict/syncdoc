"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMyLevel, setMyLang } from "@/app/doc/[id]/actions";
import type { ExpertiseLevel, Lang } from "@/lib/repo";

const LEVEL_LABEL: Record<ExpertiseLevel, string> = {
  beginner: "입문",
  intermediate: "중급",
  expert: "전문가",
};
const LANG_LABEL: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

/**
 * 내 언어·수준 컨트롤 (백서 리더 크롬).
 * - 언어: 콘텐츠(백서·대화)가 이 자연어로 번역되어 보인다. 전환 시 필요한 번역을 생성.
 * - 수준: 상대 직군 글이 이 숙련도에 맞춰 번역된다(이후 새 번역부터).
 */
export default function LevelSelector({
  docId,
  level,
  lang = "ko",
}: {
  docId: number;
  level: ExpertiseLevel;
  lang?: Lang;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onLang = (next: string) =>
    startTransition(async () => {
      await setMyLang(docId, next);
      router.refresh();
    });
  const onLevel = (next: string) =>
    startTransition(async () => {
      await setMyLevel(docId, next);
      router.refresh();
    });

  return (
    <label
      title="콘텐츠가 선택한 언어·수준으로 번역되어 보입니다. 언어 전환 시 필요한 번역이 생성됩니다."
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "#fff",
        border: "1px solid #E0DCD2",
        borderRadius: 10,
        padding: "6px 11px",
        fontFamily: "inherit",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2D4FD4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginInlineEnd: 3 }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.5 2.6 4 5.7 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.7-4-9s1.5-6.4 4-9z" />
      </svg>
      <select
        value={lang}
        disabled={isPending}
        onChange={(e) => onLang(e.target.value)}
        style={selStyle}
      >
        {(Object.keys(LANG_LABEL) as Lang[]).map((v) => (
          <option key={v} value={v}>{LANG_LABEL[v]}</option>
        ))}
      </select>
      <span style={{ color: "#C9C3B5" }}>·</span>
      <select
        value={level}
        disabled={isPending}
        onChange={(e) => onLevel(e.target.value)}
        style={selStyle}
      >
        {(Object.keys(LEVEL_LABEL) as ExpertiseLevel[]).map((v) => (
          <option key={v} value={v}>{LEVEL_LABEL[v]}</option>
        ))}
      </select>
    </label>
  );
}

const selStyle: React.CSSProperties = {
  border: 0,
  background: "transparent",
  fontSize: 13,
  fontWeight: 600,
  color: "#3C3A34",
  fontFamily: "inherit",
  cursor: "pointer",
  outline: "none",
};
