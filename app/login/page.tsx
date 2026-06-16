import { redirect } from "next/navigation";

/**
 * /login 폐기 — 인증은 /start(회원가입·이메일 로그인)로 통일한다.
 * 옛 데모 계정(username) 로그인 화면은 더 이상 쓰지 않는다.
 */
export default function LoginPage() {
  redirect("/start");
}
