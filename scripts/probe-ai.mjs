// AI 프로바이더 연결 점검 (1회성 진단용) — .env.local의 키/모델로 최소 호출을 보내
// HTTP 상태와 토큰 사용량만 출력한다. 키는 출력하지 않는다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);

const model = env.OPENAI_MODEL;
const baseUrl = env.OPENAI_BASE_URL || "https://api.openai.com/v1";
console.log(`probe: provider=openai model=${model} base=${baseUrl}`);

const res = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model,
    max_completion_tokens: 2000,
    messages: [
      { role: "system", content: "한 단어로만 답하라." },
      { role: "user", content: "OK라고 답해." },
    ],
  }),
});

console.log(`HTTP ${res.status}`);
const data = await res.json();
if (!res.ok) {
  console.log("error:", JSON.stringify(data.error ?? data).slice(0, 500));
} else {
  console.log("content:", JSON.stringify(data.choices?.[0]?.message?.content));
  console.log("usage:", JSON.stringify(data.usage));
}
