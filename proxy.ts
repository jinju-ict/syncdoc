/**
 * 비로그인 차단 프록시 (Next 16: middleware.ts → proxy.ts로 개명됨).
 * 여기서는 세션 쿠키 존재만 검사한다. HMAC 서명 검증은 서버 컴포넌트/액션의
 * getSession()이 수행하며, 위조 쿠키는 거기서 걸러져 /login으로 리다이렉트된다.
 */

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "syncdoc_session";

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  // /login과 /start(온보딩 셸)는 비로그인 상태에서도 진입할 수 있어야 한다.
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/start");

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // 쿠키가 있어도 /login 접근은 허용한다. 쿠키 존재만으로 /로 되돌리면
  // 위조·만료된 쿠키가 남아 있을 때 /login → / → /login 무한 루프가 생긴다
  // (서명 검증은 getSession()만 수행 가능). 유효한 세션이면 로그인 액션이
  // 쿠키를 덮어쓰므로 로그인 폼 노출은 무해하다.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
