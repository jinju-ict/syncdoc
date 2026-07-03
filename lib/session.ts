/**
 * 서명 쿠키 세션 (HMAC-SHA256).
 * 토큰 포맷: base64url(JSON payload) + "." + HMAC(payload)
 * proxy.ts는 쿠키 존재만 검사하고, 서명 검증은 여기(getSession)에서 수행한다.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "./schema";

export const SESSION_COOKIE = "syncdoc_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7일

// 운영(production)에서는 SESSION_SECRET이 반드시 있어야 한다. 없으면 공개된 개발용
// 기본값으로 세션 서명이 위조 가능하므로, 세션을 다루는 첫 요청에서 즉시 실패시킨다(fail fast).
// 지연 평가인 이유: 모듈 로드 시점(=`next build`의 NODE_ENV=production)에 throw하면 빌드가
// 깨지므로, 실제 서명/검증이 일어나는 런타임에만 검사한다. 개발에서는 편의상 폴백.
let cachedSecret: string | null = null;
function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  const s = process.env.SESSION_SECRET;
  if (s && s.length > 0) return (cachedSecret = s);
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "SESSION_SECRET 환경변수가 필요합니다 (운영 환경). 세션 위조 방지를 위해 반드시 설정하세요."
    );
  return (cachedSecret = "syncdoc-dev-secret-do-not-use-in-prod");
}

export type Session = {
  uid: number;
  username: string;
  role: Role;
  exp: number; // epoch seconds
};

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function encodeSession(payload: Session): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function decodeSession(token: string): Session | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(data);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    ) as Session;
    if (typeof payload.uid !== "number" || typeof payload.exp !== "number")
      return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (payload.role !== "planner" && payload.role !== "developer") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(user: {
  id: number;
  username: string;
  role: Role;
}): Promise<void> {
  const payload: Session = {
    uid: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
