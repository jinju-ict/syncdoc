/**
 * AI 계층 (lib/ai.ts) — Claude API: translate / suggest / abstract
 *
 * 규약 (계획 §AI 계층):
 * - 모든 함수는 절대 throw하지 않고 {ok:false, error}를 반환한다.
 * - 모델: env ANTHROPIC_MODEL (기본 'claude-opus-4-8'), 키: env ANTHROPIC_API_KEY
 *   (키 부재 시 throw 없이 {ok:false, error:'API key not configured'})
 * - translate: 무창작(원문에 없는 요구·수치·결정 추가 금지),
 *   불확실 항목은 `> ⚠️ 확인 필요:` 인용 블록으로 표기. 직군별 시스템 프롬프트 2종.
 * - suggest: 객관식 옵션을 tool-use(강제 tool_choice + JSON schema)로 받아
 *   zod로 검증 — 파싱 실패 시 {ok:false}.
 * - abstract: 전체 잠금 히스토리 → 프로젝트 "최종 상태(Current State)"의
 *   Abstract + TOC 마크다운. suggest와 동일한 강제 tool-use + zod 검증.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
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

// ---------------------------------------------------------------------------
// 클라이언트 / 모델 (호출 시점에 env를 읽는다 — 테스트·키 회전 안전)
// ---------------------------------------------------------------------------

function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function toError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// translate — 직군 관점 번역 (시스템 프롬프트 2종)
// ---------------------------------------------------------------------------

/** 공통 절대 규칙 — 무창작 + '확인 필요' 표기 + 마크다운만 출력 */
const HARD_RULES = `
[절대 규칙 — 반드시 지킬 것]
1. 무창작: 원문에 없는 요구사항·수치·기한·결정·기능을 절대 추가하지 않는다.
   원문의 모든 수치·단위·고유명사·조건은 한 글자도 바꾸지 말고 그대로 보존한다.
2. 추정 분리: 원문에 근거가 없어 불확실하거나 추정이 필요한 사항은 본문에 섞어
   단정하지 말고, 반드시 아래 형식의 인용 블록으로만 명시한다:
   > ⚠️ 확인 필요: (확인할 질문이나 내용)
   확인 필요 블록은 해당 추정이 발생한 섹션 바로 아래에 둔다.
3. 출력 형식: 번역된 마크다운 본문만 출력한다. 인사말·서두·메타 설명·
   코드펜스(\`\`\`)로 전체를 감싸는 행위 모두 금지.
4. 원문이 이미 짧고 명확하면 억지로 늘리지 않는다 — 재구성은 관점 변환이지
   내용 증식이 아니다.`;

/** targetRole별 시스템 프롬프트 — targetRole = 번역을 "읽는" 직군 */
const TRANSLATE_SYSTEM: Record<Role, string> = {
  developer: `너는 기획자와 개발자 사이의 도메인 통역사다.
기획자가 작성한 마크다운 문서를 받아, 개발자가 바로 구현 검토에 쓸 수 있도록
**데이터 / 흐름 / 예외처리** 관점으로 재구성해 한국어 마크다운으로 출력한다.

[재구성 관점]
- 데이터: 등장하는 엔티티·필드·상태값·수치 제약을 명시적으로 정리한다.
- 흐름: 사용자의 행동과 시스템 처리 순서를 단계별로 정리한다 (트리거 → 처리 → 결과).
- 예외처리: 원문이 언급한 실패·경계 조건을 모은다. 원문에 없는 예외를 만들어내지
  말 것 — 빠져 보이는 예외는 '확인 필요' 블록으로만 질문한다.
${HARD_RULES}`,

  planner: `너는 개발자와 기획자 사이의 도메인 통역사다.
개발자가 작성한 마크다운 문서를 받아, 기획자가 제품 결정에 바로 쓸 수 있도록
**사용자 가치 / 시나리오** 관점으로 재구성해 한국어 마크다운으로 출력한다.

[재구성 관점]
- 사용자 가치: 이 변경/구현이 사용자와 비즈니스에 무엇을 가능하게 또는 불가능하게
  하는지, 원문에 적힌 사실 범위 안에서 풀어 쓴다.
- 시나리오: 기술 용어를 사용자 행동 시나리오("사용자가 ~하면 ~된다")로 바꿔
  설명한다. 기술적 제약(수치·한도·에러 동작)은 사용자 경험 언어로 옮기되 값은
  그대로 보존한다.
- 의사결정 포인트: 기획 판단이 필요한 항목은 '확인 필요' 블록으로만 질문한다.
${HARD_RULES}`,
};

/** 블록 원문을 상대 직군 관점으로 1회 번역 (잠금 트랜잭션 밖에서 호출됨) */
export async function translate(
  sourceMd: string,
  targetRole: Role
): Promise<TranslateResult> {
  try {
    const client = getClient();
    if (!client) return { ok: false, error: "API key not configured" };

    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: TRANSLATE_SYSTEM[targetRole],
      messages: [
        {
          role: "user",
          content: `다음 원문 마크다운을 규칙에 따라 번역(재구성)하라:\n\n${sourceMd}`,
        },
      ],
    });

    const md = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!md) return { ok: false, error: "번역 결과가 비어 있습니다." };
    return { ok: true, md };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

// ---------------------------------------------------------------------------
// suggest — 초안 개선 제안 (강제 tool-use + JSON schema + zod 검증)
// ---------------------------------------------------------------------------

const SUGGEST_TOOL_NAME = "propose_improvements";

const SUGGEST_SYSTEM = `너는 기획자↔개발자 협업 문서의 초안 검토자다.
작성자가 '보내기' 전 초안 마크다운을 검토해, 누락·모호·개선 포인트를
**2~4개의 객관식 제안**으로 만들어 ${SUGGEST_TOOL_NAME} 도구로만 응답한다.

[제안 작성 규칙]
- 각 옵션은 작성자가 수락하면 초안에 그대로 덧붙이거나 반영할 수 있는,
  자체 완결된 한국어 마크다운 문장 또는 짧은 단락이어야 한다.
- 서로 다른 측면(누락된 조건, 모호한 수치, 예외 상황, 상대 직군이 물어볼 질문 등)을
  다루는 옵션을 우선한다. 같은 내용의 변주는 금지.
- 원문에 없는 결정을 대신 내리지 말 것 — 결정이 필요한 부분은
  "~을(를) 명시하면 좋습니다: (예: …)" 형태로 제안한다.
- 옵션은 최소 2개, 최대 4개.`;

const suggestSchema = z.object({
  options: z.array(z.string().trim().min(1)).min(2),
});

/** 초안 단계 개선 제안 (객관식 옵션 목록) */
export async function suggest(draftMd: string): Promise<SuggestResult> {
  try {
    const client = getClient();
    if (!client) return { ok: false, error: "API key not configured" };

    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 8192,
      system: SUGGEST_SYSTEM,
      // 강제 tool_choice — 항상 구조화된 {options: string[]}로만 응답
      tool_choice: {
        type: "tool",
        name: SUGGEST_TOOL_NAME,
        disable_parallel_tool_use: true,
      },
      tools: [
        {
          name: SUGGEST_TOOL_NAME,
          description:
            "초안에 대한 객관식 개선 제안 목록을 제출한다. options의 각 항목은 초안에 그대로 반영 가능한 한국어 마크다운 텍스트.",
          strict: true,
          input_schema: {
            type: "object",
            properties: {
              options: {
                type: "array",
                description:
                  "2~4개의 개선 제안. 각 항목은 자체 완결된 마크다운 텍스트.",
                items: { type: "string" },
              },
            },
            required: ["options"],
            additionalProperties: false,
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: `다음 초안 마크다운을 검토하고 개선 제안을 제출하라:\n\n${draftMd}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === SUGGEST_TOOL_NAME
    );
    if (!toolUse)
      return { ok: false, error: "제안 도구 호출이 응답에 없습니다." };

    const parsed = suggestSchema.safeParse(toolUse.input);
    if (!parsed.success)
      return { ok: false, error: "제안 응답 형식이 올바르지 않습니다." };

    return { ok: true, options: parsed.data.options.slice(0, 4) };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

// ---------------------------------------------------------------------------
// abstract — 전체 잠금 히스토리 → Abstract + TOC (강제 tool-use + zod 검증)
// ---------------------------------------------------------------------------

const ABSTRACT_TOOL_NAME = "submit_abstract";

const ABSTRACT_ROLE_LABEL: Record<Role, string> = {
  planner: "기획자",
  developer: "개발자",
};

const ABSTRACT_SYSTEM = `너는 기획자↔개발자 협업 문서의 서기다.
프로젝트 문서의 전체 히스토리(시간순으로 잠긴 블록들)를 분석해, 문서 최상단에
고정될 **Abstract(요약 표지)**와 **TOC(목차)**를 ${ABSTRACT_TOOL_NAME} 도구로만
제출한다.

[Abstract 작성 규칙]
- 히스토리의 사건 나열이 아니라 프로젝트의 "최종 상태(Current State)"를 보여준다:
  지금까지의 합의 결과로 이 프로젝트가 무엇이며, 무엇이 어떻게 결정되었는지 요약한다.
- 논의가 진행되며 번복·구체화된 사항은 가장 나중 블록의 내용을 최종 상태로 채택한다.
- 한국어 마크다운으로 작성한다.

[TOC 작성 규칙]
- 히스토리 블록들의 주제 흐름을 마크다운 목록 형태의 목차로 정리한다.
- 각 항목에는 근거가 된 블록의 버전 태그를 괄호로 병기한다
  (예: \`- 결제 플로우 확정 ([2026-06-10 v3 - 개발팀])\`).

[절대 규칙 — 무창작]
1. 원문 블록들에 없는 요구사항·수치·기한·결정·기능을 절대 추가하지 않는다.
   원문의 수치·단위·고유명사·조건은 한 글자도 바꾸지 말고 그대로 보존한다.
2. 원문에 근거가 없어 불확실한 사항은 본문에 섞어 단정하지 말고, 반드시
   "> ⚠️ 확인 필요: (확인할 질문이나 내용)" 인용 블록으로만 명시한다.
3. 인사말·서두·메타 설명 금지 — 도구 입력의 두 필드에 마크다운 본문만 담는다.`;

const abstractSchema = z.object({
  abstract_md: z.string().trim().min(1),
  toc_md: z.string().trim().min(1),
});

/** 전체 잠금 블록 히스토리 → Abstract + TOC */
export async function abstract(
  blocks: { sourceMd: string; authorRole: Role; versionTag: string | null }[]
): Promise<AbstractResult> {
  try {
    if (blocks.length === 0)
      return { ok: false, error: "분석할 잠긴 블록이 없습니다." };

    const client = getClient();
    if (!client) return { ok: false, error: "API key not configured" };

    const history = blocks
      .map(
        (b, i) =>
          `### 블록 ${i + 1} ${b.versionTag ?? ""} — ${
            ABSTRACT_ROLE_LABEL[b.authorRole]
          } 작성\n\n${b.sourceMd}`
      )
      .join("\n\n---\n\n");

    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 16000,
      system: ABSTRACT_SYSTEM,
      // 강제 tool_choice — 항상 {abstract_md, toc_md} 구조로만 응답
      tool_choice: {
        type: "tool",
        name: ABSTRACT_TOOL_NAME,
        disable_parallel_tool_use: true,
      },
      tools: [
        {
          name: ABSTRACT_TOOL_NAME,
          description:
            "전체 히스토리 분석 결과인 Abstract(요약 표지)와 TOC(목차) 마크다운을 제출한다.",
          strict: true,
          input_schema: {
            type: "object",
            properties: {
              abstract_md: {
                type: "string",
                description:
                  "프로젝트의 최종 상태(Current State)를 보여주는 요약 표지. 한국어 마크다운 본문만.",
              },
              toc_md: {
                type: "string",
                description:
                  "히스토리 주제 흐름의 목차. 마크다운 목록, 각 항목에 버전 태그 병기.",
              },
            },
            required: ["abstract_md", "toc_md"],
            additionalProperties: false,
          },
        },
      ],
      messages: [
        {
          role: "user",
          content: `다음은 문서의 전체 잠금 히스토리(시간순)다. 규칙에 따라 Abstract와 TOC를 제출하라:\n\n${history}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === ABSTRACT_TOOL_NAME
    );
    if (!toolUse)
      return { ok: false, error: "표지 도구 호출이 응답에 없습니다." };

    const parsed = abstractSchema.safeParse(toolUse.input);
    if (!parsed.success)
      return { ok: false, error: "표지 응답 형식이 올바르지 않습니다." };

    return {
      ok: true,
      abstractMd: parsed.data.abstract_md.trim(),
      tocMd: parsed.data.toc_md.trim(),
    };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}
