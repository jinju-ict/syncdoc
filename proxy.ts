/**
 * 비로그인 차단 프록시 (Next 16: middleware.ts → proxy.ts로 개명됨).
 * 여기서는 세션 쿠키 존재만 검사한다. HMAC 서명 검증은 서버 컴포넌트/액션의
 * getSession()이 수행하며, 위조 쿠키는 거기서 걸러져 /login으로 리다이렉트된다.
 */

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "syncdoc_session";

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!hasSession && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
