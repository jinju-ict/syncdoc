/**
 * AI 계층 (lib/ai.ts) — translate / suggest / abstract
 *
 * 프로바이더 선택 (env AI_PROVIDER):
 * - "anthropic" : Claude API (ANTHROPIC_API_KEY, ANTHROPIC_MODEL 기본 claude-opus-4-8)
 * - "openai"    : OpenAI API (OPENAI_API_KEY, OPENAI_MODEL, OPENAI_BASE_URL 변경 가능)
 * - "ollama"    : 로컬 모델 — Ollama/LM Studio 등 OpenAI 호환 서버
 *                 (OLLAMA_BASE_URL 기본 http://localhost:11434/v1, OLLAMA_MODEL 필수)
 * AI_PROVIDER 미설정 시 자동 감지: ANTHROPIC_API_KEY → OPENAI_API_KEY → OLLAMA_MODEL 순.
 *
 * 규약 (계획 §AI 계층):
 * - 모든 함수는 절대 throw하지 않고 {ok:false, error}를 반환한다.
 * - translate: 무창작(원문에 없는 요구·수치·결정 추가 금지),
 *   불확실 항목은 `> ⚠️ 확인 필요:` 인용 블록으로 표기. 직군별 시스템 프롬프트 2종.
 * - suggest/abstract: 구조화 출력 — Anthropic은 강제 tool_choice, OpenAI 호환은
 *   response_format json_schema(미지원 서버는 json_object 폴백) — 항상 zod로 검증.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ExpertiseLevel, Lang, ProjectRole } from "./schema";

export type TranslateResult =
  | { ok: true; md: string }
  | { ok: false; error: string };

export type SuggestResult =
  | { ok: true; options: string[] }
  | { ok: false; error: string };

export type AbstractResult =
  | { ok: true; abstractMd: string; tocMd: string }
  | { ok: false; error: string };

export type DistillResult =
  | { ok: true; title: string; bodyMd: string }
  | { ok: false; error: string };

function toError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// 토큰 사용량/비용 로깅 — 모든 AI 호출 후 dev 서버 터미널에 출력
// ---------------------------------------------------------------------------

/** USD per 1M tokens. 모델명 prefix 매칭 — 구체적인 prefix를 먼저 둘 것. */
const PRICING_PER_MTOK: { prefix: string; input: number; output: number }[] = [
  // Anthropic
  { prefix: "claude-opus-4", input: 5, output: 25 },
  { prefix: "claude-sonnet-4", input: 3, output: 15 },
  { prefix: "claude-haiku-4", input: 1, output: 5 },
  // OpenAI ("gpt-5.1"은 "gpt-5"보다 먼저)
  { prefix: "gpt-5.1", input: 1.25, output: 10 },
  { prefix: "gpt-5-mini", input: 0.25, output: 2 },
  { prefix: "gpt-5-nano", input: 0.05, output: 0.4 },
  { prefix: "gpt-5", input: 1.25, output: 10 },
  { prefix: "gpt-4o-mini", input: 0.15, output: 0.6 },
  { prefix: "gpt-4o", input: 2.5, output: 10 },
  { prefix: "gpt-4.1-mini", input: 0.4, output: 1.6 },
  { prefix: "gpt-4.1", input: 2, output: 8 },
];

// dev 서버 프로세스 생존 동안의 누적치 (재기동 시 리셋)
let sessionTokens = 0;
let sessionCostUsd = 0;

function logUsage(
  provider: Provider,
  model: string,
  op: string,
  inputTokens: number,
  outputTokens: number
): void {
  const fmt = (n: number) => n.toLocaleString("en-US");
  let costLabel: string;

  if (provider === "ollama") {
    costLabel = "$0.0000 (로컬 — 무료)";
  } else {
    const price = PRICING_PER_MTOK.find((p) => model.startsWith(p.prefix));
    if (price) {
      const cost =
        (inputTokens / 1_000_000) * price.input +
        (outputTokens / 1_000_000) * price.output;
      sessionCostUsd += cost;
      costLabel = `$${cost.toFixed(4)}`;
    } else {
      costLabel = "단가 미등록 (비용 생략)";
    }
  }
  sessionTokens += inputTokens + outputTokens;

  console.log(
    `[AI 사용량] ${op} · ${provider}/${model} — 입력 ${fmt(inputTokens)} + 출력 ${fmt(
      outputTokens
    )} 토큰 = ${costLabel} | 서버 누적 ${fmt(sessionTokens)} 토큰, $${sessionCostUsd.toFixed(4)}`
  );
}

// ---------------------------------------------------------------------------
// 프로바이더 해석 (호출 시점에 env를 읽는다 — 키 회전·재기동 시 안전)
// ---------------------------------------------------------------------------

type Provider = "anthropic" | "openai" | "ollama";

type ProviderConfig =
  | { ok: true; provider: "anthropic"; apiKey: string; model: string }
  | {
      ok: true;
      provider: "openai" | "ollama";
      baseUrl: string;
      apiKey: string;
      model: string;
    }
  | { ok: false; error: string };

function resolveProvider(): ProviderConfig {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  let provider: Provider | undefined;

  if (explicit) {
    if (explicit !== "anthropic" && explicit !== "openai" && explicit !== "ollama") {
      return {
        ok: false,
        error: `AI_PROVIDER 값이 올바르지 않습니다: "${explicit}" (anthropic | openai | ollama)`,
      };
    }
    provider = explicit;
  } else if (process.env.ANTHROPIC_API_KEY) {
    provider = "anthropic";
  } else if (process.env.OPENAI_API_KEY) {
    provider = "openai";
  } else if (process.env.OLLAMA_MODEL) {
    provider = "ollama";
  }

  if (!provider) {
    return {
      ok: false,
      error:
        "AI 프로바이더가 설정되지 않았습니다. .env.local에 ANTHROPIC_API_KEY 또는 OPENAI_API_KEY 또는 OLLAMA_MODEL(+로컬 서버)을 설정하세요.",
    };
  }

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." };
    return {
      ok: true,
      provider,
      apiKey,
      // `||` 사용: .env.local에 `KEY=`(빈 값)로 두는 경우가 정상 패턴이므로
      // 빈 문자열도 "미설정"으로 취급해 기본값을 적용한다.
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
    };
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { ok: false, error: "OPENAI_API_KEY가 설정되지 않았습니다." };
    const model = process.env.OPENAI_MODEL;
    if (!model) {
      return {
        ok: false,
        error:
          "OPENAI_MODEL이 설정되지 않았습니다. .env.local에 사용할 모델명을 지정하세요 (예: gpt-5-mini).",
      };
    }
    return {
      ok: true,
      provider,
      apiKey,
      model,
      // 빈 문자열(`OPENAI_BASE_URL=`)도 미설정으로 취급 — `??`면 fetch("/chat/...")가 즉시 실패한다
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    };
  }

  // ollama (또는 LM Studio 등 OpenAI 호환 로컬 서버)
  const model = process.env.OLLAMA_MODEL;
  if (!model) {
    return {
      ok: false,
      error:
        "OLLAMA_MODEL이 설정되지 않았습니다. 로컬에 받아둔 모델명을 지정하세요 (예: qwen3:8b, llama3.1:8b).",
    };
  }
  return {
    ok: true,
    provider: "ollama",
    apiKey: process.env.OLLAMA_API_KEY || "ollama", // Ollama는 인증을 무시하지만 헤더 형식은 맞춘다
    model,
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
  };
}

// ---------------------------------------------------------------------------
// OpenAI 호환 호출 (OpenAI · Ollama · LM Studio 공용, fetch 기반 — 추가 의존성 없음)
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

async function openaiCompatChat(
  cfg: Extract<ProviderConfig, { provider: "openai" | "ollama" }>,
  args: {
    system: string;
    user: string;
    maxTokens: number;
    op: string;
    responseFormat?: Record<string, unknown>;
  }
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      // 신형 OpenAI 모델은 max_tokens 대신 max_completion_tokens를 요구한다.
      // (Ollama/LM Studio는 미지의 필드를 무시하므로 무해)
      max_completion_tokens: args.maxTokens,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      ...(args.responseFormat ? { response_format: args.responseFormat } : {}),
    }),
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: `${cfg.provider} API 오류 (HTTP ${res.status}): ${body}` };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  logUsage(
    cfg.provider,
    cfg.model,
    args.op,
    data.usage?.prompt_tokens ?? 0,
    data.usage?.completion_tokens ?? 0
  );
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) return { ok: false, error: "응답이 비어 있습니다." };
  return { ok: true, text };
}

/** 응답 텍스트에서 JSON 객체를 추출 (코드펜스·서두 잡설 방어) */
function extractJson(text: string): unknown | null {
  const stripped = text.replace(/```(?:json)?/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 프로바이더 공용 프리미티브: 텍스트 응답 / 구조화(JSON) 응답
// ---------------------------------------------------------------------------

async function chatText(args: {
  system: string;
  user: string;
  maxTokens: number;
  op: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const cfg = resolveProvider();
  if (!cfg.ok) return cfg;

  if (cfg.provider === "anthropic") {
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: args.maxTokens,
      thinking: { type: "adaptive" },
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });
    logUsage(
      "anthropic",
      cfg.model,
      args.op,
      response.usage.input_tokens,
      response.usage.output_tokens
    );
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "응답이 비어 있습니다." };
    return { ok: true, text };
  }

  return openaiCompatChat(cfg, args);
}

async function chatStructured<T>(args: {
  system: string;
  user: string;
  maxTokens: number;
  op: string;
  toolName: string;
  toolDescription: string;
  jsonSchema: JsonSchema;
  zodSchema: z.ZodType<T>;
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const cfg = resolveProvider();
  if (!cfg.ok) return cfg;

  if (cfg.provider === "anthropic") {
    // 강제 tool_choice — 항상 구조화된 입력으로만 응답
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: args.maxTokens,
      system: args.system,
      tool_choice: {
        type: "tool",
        name: args.toolName,
        disable_parallel_tool_use: true,
      },
      tools: [
        {
          name: args.toolName,
          description: args.toolDescription,
          strict: true,
          input_schema: args.jsonSchema as Anthropic.Tool["input_schema"],
        },
      ],
      messages: [{ role: "user", content: args.user }],
    });
    logUsage(
      "anthropic",
      cfg.model,
      args.op,
      response.usage.input_tokens,
      response.usage.output_tokens
    );
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === args.toolName
    );
    if (!toolUse) return { ok: false, error: "구조화 응답이 없습니다." };
    const parsed = args.zodSchema.safeParse(toolUse.input);
    if (!parsed.success) return { ok: false, error: "응답 형식이 올바르지 않습니다." };
    return { ok: true, data: parsed.data };
  }

  // OpenAI 호환: 1차 — json_schema 강제. 일부 로컬 서버가 미지원이면 2차 — json_object 폴백.
  const first = await openaiCompatChat(cfg, {
    ...args,
    responseFormat: {
      type: "json_schema",
      json_schema: { name: args.toolName, strict: true, schema: args.jsonSchema },
    },
  });

  let text: string;
  if (first.ok) {
    text = first.text;
  } else {
    const second = await openaiCompatChat(cfg, {
      system: `${args.system}\n\n[출력 형식] 반드시 다음 JSON 스키마를 따르는 JSON 객체 하나만 출력한다. 다른 텍스트 금지:\n${JSON.stringify(args.jsonSchema)}`,
      user: args.user,
      maxTokens: args.maxTokens,
      op: args.op,
      responseFormat: { type: "json_object" },
    });
    if (!second.ok) return first; // 원래 오류가 더 유의미
    text = second.text;
  }

  const json = extractJson(text);
  if (json === null) return { ok: false, error: "응답에서 JSON을 추출하지 못했습니다." };
  const parsed = args.zodSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "응답 형식이 올바르지 않습니다." };
  return { ok: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// translate — 직군 관점 번역 (시스템 프롬프트 2종)
// ---------------------------------------------------------------------------

/**
 * 메시지 통역 — 직군 관점 '재구성'이 아니라, 채팅 메시지 그대로의 충실한 번역.
 * 영어→한국어 번역처럼 표현만 바꾸고 내용·길이는 그대로 둔다.
 * (백서식 풀어쓰기·구조화는 distillSection이 따로 담당한다)
 */
const INTERPRET_BASE = `너는 직군 간 채팅 메시지를 옮기는 통역사다.
한 사람이 채팅에 쓴 메시지를, 읽는 사람이 바로 이해할 수 있게 자연스럽게 옮긴다.
영어를 한국어로 번역하듯 — 표현만 바꾸고 내용은 그대로 두는, 문장 단위의 충실한 번역이다.

[통역 원칙 — 반드시 지킬 것]
1. 의미 1:1 보존: 원문의 뜻을 그대로 옮긴다. 원문에 없는 사실·배경·이유·예시·항목을
   절대 덧붙이지 않는다. 설명하려고 늘리지 않는다.
2. 전문용어 풀기: 읽는 사람이 낯설어할 전문 용어·약어·기술 표현을, 그 사람이
   직관적으로 아는 말로 바꾼다.
   예) "초과 시 429 응답과 함께 Retry-After 헤더(60초)를 반환한다."
     → "요청이 한도를 넘으면 '약 60초 뒤에 다시 시도하라'는 응답을 돌려준다."
3. 길이·구조 보존: 원문과 비슷한 분량·형태로 옮긴다. 한 문장은 한 문장으로.
   원문에 없던 절·목록·제목·머리말을 새로 만들지 않는다.
4. 수치·단위·고유명사·조건은 한 글자도 바꾸지 않고 그대로 둔다.
5. 출력은 옮긴 메시지 본문만. 인사말·서두·메타 설명·코드펜스로 감싸기 모두 금지.`;

/** targetRole = 메시지를 "읽는" 직군. 풀어줄 방향만 정하고 내용은 건드리지 않는다. */
const READER_HINT: Record<ProjectRole, string> = {
  developer:
    "\n\n읽는 사람은 개발자다. 기획·디자인·운영의 말을 개발자가 익숙한 정확한 표현으로 옮긴다.",
  planner:
    "\n\n읽는 사람은 기획자다. 기술·운영 용어를 제품·사용자 관점의 일상적인 말로 옮긴다.",
  designer:
    "\n\n읽는 사람은 디자이너다. 기술·기획 용어를 화면·경험 관점의 익숙한 말로 옮긴다.",
  ops:
    "\n\n읽는 사람은 운영자다. 기술·기획 용어를 운영·지원 관점의 익숙한 말로 옮긴다.",
};

/** targetRole별 시스템 프롬프트 — targetRole = 번역을 "읽는" 직군 (4직군) */
const TRANSLATE_SYSTEM: Record<ProjectRole, string> = {
  developer: INTERPRET_BASE + READER_HINT.developer,
  planner: INTERPRET_BASE + READER_HINT.planner,
  designer: INTERPRET_BASE + READER_HINT.designer,
  ops: INTERPRET_BASE + READER_HINT.ops,
};

/**
 * 독자 숙련도별 표현 조정 — 내용(요구사항·수치·결정)이 아니라 표현 방식만 바꾼다.
 * 무창작·'확인 필요' 절대 규칙은 레벨과 무관하게 그대로 적용된다.
 */
const LEVEL_ADDENDUM: Record<ExpertiseLevel, string> = {
  beginner: `

[독자 수준: 입문]
- 독자는 이 분야 배경지식이 거의 없다. 전문 용어·약어는 첫 등장 시
  괄호로 한 줄 풀이를 덧붙인다. (예: "슬라이딩 윈도우(최근 일정 시간만 집계하는 방식)")
- 짧은 문장과 단계적 설명을 쓰고, 필요하면 원문 사실 범위 안에서 일상적 표현으로 풀어 쓴다.
- 주의: 풀이는 표현을 돕는 장치다. 원문에 없는 요구사항·수치·결정을 새로 만드는 것은
  여전히 금지다(절대 규칙 1·2 그대로 적용).`,
  intermediate: "",
  expert: `

[독자 수준: 전문가]
- 독자는 해당 직군 전문가다. 용어 풀이·배경 설명은 생략하고 밀도 높게 요점만 정리한다.
- 간결함이 우선이지만 원문의 수치·조건·예외는 하나도 생략하지 않는다.`,
};

/** 자연어 출력 언어 — 직군 프롬프트가 "한국어"라 해도 이 지시가 최종 출력 언어를 정한다 */
const LANG_NAME: Record<Lang, string> = { ko: "한국어", en: "English", ja: "日本語" };
const LANG_ADDENDUM: Record<Lang, string> = {
  ko: "",
  en: `

[OUTPUT LANGUAGE — HIGHEST PRIORITY]
Even though the instructions above say to write in Korean, write the ENTIRE final output in natural English.
Preserve all numbers, units, and proper nouns exactly. Keep the callout format but use "> ⚠️ Needs confirmation:" as the label.`,
  ja: `

[出力言語 — 最優先]
上の指示に「韓国語で出力」とあっても、最終出力は必ず自然な日本語で書く。
数値・単位・固有名詞はそのまま保持する。確認事項の引用ブロックは「> ⚠️ 要確認:」のラベルで書く。`,
};

/**
 * 블록 원문을 상대 직군 관점 + 대상 언어로 1회 번역 (잠금 트랜잭션 밖에서 호출됨).
 * targetLevel = 독자 숙련도, targetLang = 독자 자연어.
 */
export async function translate(
  sourceMd: string,
  targetRole: ProjectRole,
  targetLevel: ExpertiseLevel = "intermediate",
  targetLang: Lang = "ko"
): Promise<TranslateResult> {
  try {
    const result = await chatText({
      system:
        TRANSLATE_SYSTEM[targetRole] +
        LEVEL_ADDENDUM[targetLevel] +
        LANG_ADDENDUM[targetLang],
      user: `다음 메시지를 통역 원칙에 따라 옮겨라 (내용·길이 보존, 전문용어만 직관적으로):\n\n${sourceMd}`,
      maxTokens: 4000,
      op: `translate→${targetRole}(${targetLevel},${targetLang})`,
    });
    if (!result.ok) return result;
    return { ok: true, md: result.text };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

/**
 * 백서 산문 직역 — 직군 관점 변환 없이 의미·수치를 보존해 대상 언어로만 옮긴다.
 * (정본은 한국어 section_content, 이건 ko 외 언어 캐시용)
 */
export async function translateProse(
  md: string,
  targetLang: Lang
): Promise<TranslateResult> {
  if (targetLang === "ko") return { ok: true, md };
  try {
    const result = await chatText({
      system: `You are a faithful document translator. Translate the given Korean markdown into ${LANG_NAME[targetLang]}.
Rules: preserve meaning exactly — do not add, remove, or reinterpret. Keep all numbers, units, and proper nouns. Preserve markdown structure. Output only the translated markdown, no preamble.`,
      user: md,
      maxTokens: 8192,
      op: `translateProse(${targetLang})`,
    });
    if (!result.ok) return result;
    return { ok: true, md: result.text };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

// ---------------------------------------------------------------------------
// suggest — 초안 개선 제안 (구조화 출력 + zod 검증)
// ---------------------------------------------------------------------------

const SUGGEST_TOOL_NAME = "propose_improvements";

const SUGGEST_SYSTEM = `너는 기획자↔개발자 협업 문서의 초안 검토자다.
작성자가 '보내기' 전 초안 마크다운을 검토해, 누락·모호·개선 포인트를
**2~4개의 객관식 제안**으로 만들어 구조화된 형식으로만 응답한다.

[제안 작성 규칙]
- 각 옵션은 작성자가 수락하면 초안에 그대로 덧붙이거나 반영할 수 있는,
  자체 완결된 한국어 마크다운 문장 또는 짧은 단락이어야 한다.
- 서로 다른 측면(누락된 조건, 모호한 수치, 예외 상황, 상대 직군이 물어볼 질문 등)을
  다루는 옵션을 우선한다. 같은 내용의 변주는 금지.
- 원문에 없는 결정을 대신 내리지 말 것 — 결정이 필요한 부분은
  "~을(를) 명시하면 좋습니다: (예: …)" 형태로 제안한다.
- 옵션은 최소 2개, 최대 4개.`;

const SUGGEST_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    options: {
      type: "array",
      description: "2~4개의 개선 제안. 각 항목은 자체 완결된 마크다운 텍스트.",
      items: { type: "string" },
    },
  },
  required: ["options"],
  additionalProperties: false,
};

const suggestSchema = z.object({
  options: z.array(z.string().trim().min(1)).min(2),
});

/** 초안 단계 개선 제안 (객관식 옵션 목록) */
export async function suggest(draftMd: string): Promise<SuggestResult> {
  try {
    const result = await chatStructured({
      system: SUGGEST_SYSTEM,
      user: `다음 초안 마크다운을 검토하고 개선 제안을 제출하라:\n\n${draftMd}`,
      maxTokens: 8192,
      op: "suggest",
      toolName: SUGGEST_TOOL_NAME,
      toolDescription:
        "초안에 대한 객관식 개선 제안 목록을 제출한다. options의 각 항목은 초안에 그대로 반영 가능한 한국어 마크다운 텍스트.",
      jsonSchema: SUGGEST_JSON_SCHEMA,
      zodSchema: suggestSchema,
    });
    if (!result.ok) return result;
    return { ok: true, options: result.data.options.slice(0, 4) };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

// ---------------------------------------------------------------------------
// suggestReplies — 대화 맥락 → 내가 다음에 보낼 만한 메시지 후보(객관식)
// ---------------------------------------------------------------------------

const REPLY_TOOL_NAME = "propose_replies";
const REPLY_ROLE_LABEL: Record<ProjectRole, string> = {
  planner: "기획자",
  developer: "개발자",
  designer: "디자이너",
  ops: "운영자",
};

/** 채팅 입력 보조 — 내 직군 입장에서 보낼 만한 짧은 메시지 후보를 제안 */
export async function suggestReplies(
  conversation: { authorRole: ProjectRole; sourceMd: string }[],
  myRole: ProjectRole,
  lang: Lang = "ko"
): Promise<SuggestResult> {
  try {
    const transcript = conversation.length
      ? conversation
          .map((m) => `${REPLY_ROLE_LABEL[m.authorRole]}: ${m.sourceMd}`)
          .join("\n")
      : "(아직 대화가 없음 — 논의를 여는 첫 메시지를 제안하라)";

    const system = `너는 채팅 참여자를 돕는 보조다. 지금까지의 대화를 보고, 내가(${REPLY_ROLE_LABEL[myRole]}) 다음에 보낼 만한 메시지 후보를 2~4개 제안해 구조화된 형식으로만 응답한다.

[규칙]
- 각 후보는 바로 보낼 수 있는, 1~2문장의 짧은 ${LANG_NAME[lang]} 메시지다. 길게 늘어놓지 않는다.
- 서로 다른 방향을 담는다 (예: 핵심을 묻는 질문 / 다음 단계 제안 / 동의·확인 / 빠진 점 보완). 같은 말의 변주는 금지.
- 내 직군(${REPLY_ROLE_LABEL[myRole]}) 입장에서 자연스러운 말투로 쓴다.
- 대화에 없는 사실·수치·결정을 지어내지 않는다. 불확실하면 단정 대신 질문 형태로.
- 출력은 구조화 형식(options 배열)만. 인사말·메타 설명 금지.`;

    const result = await chatStructured({
      system,
      user: `다음은 지금까지의 대화(시간순)다. 내가(${REPLY_ROLE_LABEL[myRole]}) 다음에 보낼 메시지 후보를 제안하라:\n\n${transcript}`,
      maxTokens: 2000,
      op: `suggestReplies(${myRole},${lang})`,
      toolName: REPLY_TOOL_NAME,
      toolDescription:
        "지금 대화에서 내가 다음에 보낼 만한 짧은 채팅 메시지 후보 2~4개를 제출한다.",
      jsonSchema: SUGGEST_JSON_SCHEMA,
      zodSchema: suggestSchema,
    });
    if (!result.ok) return result;
    return { ok: true, options: result.data.options.slice(0, 4) };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

// ---------------------------------------------------------------------------
// abstract — 전체 잠금 히스토리 → Abstract + TOC (구조화 출력 + zod 검증)
// ---------------------------------------------------------------------------

const ABSTRACT_TOOL_NAME = "submit_abstract";

const ABSTRACT_ROLE_LABEL: Record<ProjectRole, string> = {
  planner: "기획자",
  developer: "개발자",
  designer: "디자이너",
  ops: "운영자",
};

const ABSTRACT_SYSTEM = `너는 기획자↔개발자 협업 문서의 서기다.
프로젝트 문서의 전체 히스토리(시간순으로 잠긴 블록들)를 분석해, 문서 최상단에
고정될 **Abstract(요약 표지)**와 **TOC(목차)**를 구조화된 형식으로만 제출한다.

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
3. 인사말·서두·메타 설명 금지 — 두 필드에 마크다운 본문만 담는다.`;

const ABSTRACT_JSON_SCHEMA: JsonSchema = {
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
};

const abstractSchema = z.object({
  abstract_md: z.string().trim().min(1),
  toc_md: z.string().trim().min(1),
});

/** 전체 잠금 블록 히스토리 → Abstract + TOC */
export async function abstract(
  blocks: { sourceMd: string; authorRole: ProjectRole; versionTag: string | null }[]
): Promise<AbstractResult> {
  try {
    if (blocks.length === 0)
      return { ok: false, error: "분석할 잠긴 블록이 없습니다." };

    const history = blocks
      .map(
        (b, i) =>
          `### 블록 ${i + 1} ${b.versionTag ?? ""} — ${
            ABSTRACT_ROLE_LABEL[b.authorRole]
          } 작성\n\n${b.sourceMd}`
      )
      .join("\n\n---\n\n");

    const result = await chatStructured({
      system: ABSTRACT_SYSTEM,
      user: `다음은 문서의 전체 잠금 히스토리(시간순)다. 규칙에 따라 Abstract와 TOC를 제출하라:\n\n${history}`,
      maxTokens: 16000,
      op: "abstract",
      toolName: ABSTRACT_TOOL_NAME,
      toolDescription:
        "전체 히스토리 분석 결과인 Abstract(요약 표지)와 TOC(목차) 마크다운을 제출한다.",
      jsonSchema: ABSTRACT_JSON_SCHEMA,
      zodSchema: abstractSchema,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      abstractMd: result.data.abstract_md.trim(),
      tocMd: result.data.toc_md.trim(),
    };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

// ---------------------------------------------------------------------------
// distillSection — 한 절의 대화(블록들) → 백서 절 산문 (1회 증류, 호출부가 캐시)
// ---------------------------------------------------------------------------

const DISTILL_TOOL_NAME = "submit_section";

const DISTILL_SYSTEM = `너는 직군 간 협업 대화를 백서의 한 절로 증류하는 서기다.
한 절("<섹션>")에 대한 시간순 대화(직군별 메시지들)를 받아, 그 절의 **합의된 내용**을
읽기 좋은 한국어 산문으로 정리해 구조화된 형식으로만 제출한다.

[증류 규칙]
- 대화의 메시지 나열이 아니라, 합의에 도달한 "결론/현재 상태"를 문서 문장으로 쓴다.
- 번복·구체화된 사항은 가장 나중 발언을 최종으로 채택한다.
- 블록(말풍선) 형식이 아니라 흐르는 문단으로 쓴다. 짧으면 한 문단이어도 좋다.
- title: 이 절 안에서 이 내용을 가리키는 짧은 항목 제목(10자 내외).
- body_md: 합의된 산문(한국어 마크다운 본문만).

[절대 규칙 — 무창작]
1. 대화에 없는 요구사항·수치·기한·결정을 추가하지 않는다. 수치·고유명사·조건은 그대로 보존.
2. 근거 없는 불확실 사항은 단정하지 말고 "> ⚠️ 확인 필요: …" 인용 블록으로만 표기.
3. 인사말·서두·메타 설명 금지 — 두 필드에 마크다운 본문만.`;

const DISTILL_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "절 안 세부 항목의 짧은 제목" },
    body_md: { type: "string", description: "합의된 내용을 정리한 한국어 마크다운 산문" },
  },
  required: ["title", "body_md"],
  additionalProperties: false,
};

const distillSchema = z.object({
  title: z.string().trim().min(1),
  body_md: z.string().trim().min(1),
});

/** 한 절의 대화 블록들을 그 절의 백서 산문으로 증류 */
export async function distillSection(
  blocks: { sourceMd: string; authorRole: ProjectRole }[],
  sectionTitle: string
): Promise<DistillResult> {
  try {
    if (blocks.length === 0)
      return { ok: false, error: "증류할 대화가 없습니다." };

    const convo = blocks
      .map(
        (b, i) =>
          `#${i + 1} (${ABSTRACT_ROLE_LABEL[b.authorRole]})\n${b.sourceMd}`
      )
      .join("\n\n---\n\n");

    const result = await chatStructured({
      system: DISTILL_SYSTEM.replace("<섹션>", sectionTitle),
      user: `다음은 "${sectionTitle}" 절의 대화(시간순)다. 규칙에 따라 이 절의 합의 내용을 증류하라:\n\n${convo}`,
      maxTokens: 8192,
      op: `distill(${sectionTitle})`,
      toolName: DISTILL_TOOL_NAME,
      toolDescription:
        "한 절의 대화를 그 절의 백서 산문(title, body_md)으로 증류해 제출한다.",
      jsonSchema: DISTILL_JSON_SCHEMA,
      zodSchema: distillSchema,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      title: result.data.title.trim(),
      bodyMd: result.data.body_md.trim(),
    };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}
