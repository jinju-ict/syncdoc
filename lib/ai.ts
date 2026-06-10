/**
 * AI 계층 (lib/ai.ts) — Claude API: translate / suggest / abstract
 *
 * 현재는 STUB. worker-ai가 내부 구현을 교체한다.
 * !! 인터페이스(함수 시그니처·반환 타입)는 변경 금지 — repo/actions가 의존한다 !!
 *
 * 규약 (계획 §AI 계층):
 * - 모든 함수는 절대 throw하지 않고 {ok:false, error}를 반환한다.
 * - 모델: env ANTHROPIC_MODEL (기본 'claude-opus-4-8'), 키: env ANTHROPIC_API_KEY
 * - translate: 무창작(원문에 없는 요구·수치·결정 추가 금지),
 *   불확실 항목은 `> ⚠️ 확인 필요:` 블록으로 표기
 * - suggest: 객관식 옵션을 structured outputs(JSON schema)로 받기
 * - abstract: 전체 잠금 히스토리 → Abstract + TOC 마크다운
 */

import type { Role } from "./schema";

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export type TranslateResult =
  | { ok: true; md: string }
  | { ok: false; error: string };

export type SuggestResult =
  | { ok: true; options: string[] }
  | { ok: false; error: string };

export type AbstractResult =
  | { ok: true; abstractMd: string; tocMd: string }
  | { ok: false; error: string };

/** 블록 원문을 상대 직군 관점으로 1회 번역 (잠금 트랜잭션 밖에서 호출됨) */
export async function translate(
  sourceMd: string,
  targetRole: Role
): Promise<TranslateResult> {
  void sourceMd;
  void targetRole;
  return { ok: false, error: "AI not yet implemented" };
}

/** 초안 단계 개선 제안 (객관식 옵션 목록) */
export async function suggest(draftMd: string): Promise<SuggestResult> {
  void draftMd;
  return { ok: false, error: "AI not yet implemented" };
}

/** 전체 잠금 블록 히스토리 → Abstract + TOC */
export async function abstract(
  blocks: { sourceMd: string; authorRole: Role; versionTag: string | null }[]
): Promise<AbstractResult> {
  void blocks;
  return { ok: false, error: "AI not yet implemented" };
}
