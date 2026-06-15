import { defineConfig } from "vitest/config";
import path from "node:path";

const root = process.cwd();

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // 격리된 테스트 DB + AI 프로바이더 미설정(네트워크 호출 없음 — AI 함수는 ok:false 반환)
    env: {
      SYNCDOC_DB_PATH: path.join(root, "test-run.db"),
      AI_PROVIDER: "",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "",
      OLLAMA_MODEL: "",
      SESSION_SECRET: "test-secret",
    },
  },
});
