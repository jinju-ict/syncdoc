import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // dev에서 localhost 외 주소(예: LAN IP)로 접속하면 Next 16이 dev 리소스를
  // 차단해 페이지가 무반응이 된다 — 사용할 호스트를 여기에 등록.
  allowedDevOrigins: ["172.30.1.4"],
};

export default nextConfig;
