import { describe, it, expect, vi } from "vitest";

// session.ts는 next/headers의 cookies를 import한다 — 토큰 서명 로직만 테스트하므로 모킹.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { encodeSession, decodeSession } from "@/lib/session";

const base = {
  uid: 7,
  username: "tester",
  role: "planner" as const,
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe("session 토큰 (HMAC 서명)", () => {
  it("encode→decode 라운드트립", () => {
    const decoded = decodeSession(encodeSession(base));
    expect(decoded).toMatchObject({ uid: 7, username: "tester", role: "planner" });
  });

  it("서명 변조 거부", () => {
    const tok = encodeSession(base);
    const last = tok.slice(-2);
    const tampered = tok.slice(0, -2) + (last === "AA" ? "BB" : "AA");
    expect(decodeSession(tampered)).toBeNull();
  });

  it("페이로드 변조(서명 불일치) 거부", () => {
    const tok = encodeSession(base);
    const sig = tok.slice(tok.lastIndexOf(".") + 1);
    const forged = Buffer.from(JSON.stringify({ ...base, uid: 999 })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`)).toBeNull();
  });

  it("만료 토큰 거부", () => {
    const tok = encodeSession({ ...base, exp: Math.floor(Date.now() / 1000) - 10 });
    expect(decodeSession(tok)).toBeNull();
  });

  it("형식 오류 거부", () => {
    expect(decodeSession("garbage")).toBeNull();
    expect(decodeSession("")).toBeNull();
  });
});
