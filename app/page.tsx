import { redirect } from "next/navigation";

/**
 * 루트는 시작 셸(프로젝트 우선 흐름)로 일원화한다.
 * 비로그인은 proxy가 /login으로 보내고, 로그인 상태면 /start(내 프로젝트)로 이동한다.
 * 개별 문서는 /project/[id] 워크스페이스 또는 /doc/[id]로 직접 접근한다.
 */
export default function Home() {
  redirect("/start");
}
