/**
 * 백서 정규 스키마 — 모든 문서가 갖는 고정 절 골격 (2026-06-14 확정).
 * 0절 "문서 정보"(meta)는 문서/프로젝트 데이터로 렌더되므로 여기엔 본문 절(1~4)만 둔다.
 * 절 안 세부 항목은 대화 증류로 자동 생성되어 채워진다 (Phase 3).
 *
 * client·server 양쪽에서 쓰므로 서버 전용 의존성을 두지 않는다.
 */

import type { Lang } from "./schema";

export type SectionKey = "why" | "what" | "how" | "rules";

export const SECTION_KEYS: readonly SectionKey[] = ["why", "what", "how", "rules"];

/** 본문 절(1~4) — num은 목차 표기, mnemonic은 영문 약칭 */
export const CONTENT_SECTIONS: {
  key: SectionKey;
  num: string;
  title: string;
  mnemonic: string;
}[] = [
  { key: "why", num: "1", title: "목적과 지향점", mnemonic: "Why" },
  { key: "what", num: "2", title: "결과물과 세부 과업", mnemonic: "What" },
  { key: "how", num: "3", title: "수행 방식과 제약", mnemonic: "How" },
  { key: "rules", num: "4", title: "운영 규칙 및 리스크 관리", mnemonic: "Rules" },
];

/** 0절 메타(문서 정보) */
export const META_SECTION = { num: "0", title: "문서 정보" } as const;

export function isSectionKey(v: unknown): v is SectionKey {
  return typeof v === "string" && (SECTION_KEYS as readonly string[]).includes(v);
}

export function sectionLabel(key: SectionKey): string {
  return CONTENT_SECTIONS.find((s) => s.key === key)?.title ?? key;
}

/** 절 제목 다국어 (백서 목차·헤딩) */
const SECTION_TITLE_L: Record<SectionKey, Record<Lang, string>> = {
  why: { ko: "목적과 지향점", en: "Purpose & Direction", ja: "目的と方向性" },
  what: { ko: "결과물과 세부 과업", en: "Deliverables & Tasks", ja: "成果物と詳細タスク" },
  how: { ko: "수행 방식과 제약", en: "Approach & Constraints", ja: "進め方と制約" },
  rules: { ko: "운영 규칙 및 리스크 관리", en: "Operating Rules & Risk", ja: "運用ルールとリスク管理" },
};
const META_TITLE_L: Record<Lang, string> = {
  ko: "문서 정보",
  en: "Document Info",
  ja: "ドキュメント情報",
};

export function sectionTitleL(key: SectionKey, lang: Lang): string {
  return SECTION_TITLE_L[key]?.[lang] ?? sectionLabel(key);
}
export function metaTitleL(lang: Lang): string {
  return META_TITLE_L[lang] ?? META_SECTION.title;
}
