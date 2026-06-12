// 내보내기 엔드포인트 점검 (1회성 진단용) — dev 기본 시크릿으로 세션 쿠키를 만들어
// /doc/1/export를 호출하고 섹션 헤더 존재 여부만 확인한다.
import { createHmac } from "node:crypto";

const SECRET = "syncdoc-dev-secret-do-not-use-in-prod"; // .env.local SESSION_SECRET 공란 → dev 기본값
const payload = {
  uid: 1,
  username: "planner",
  role: "planner",
  exp: Math.floor(Date.now() / 1000) + 3600,
};
const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
const cookie = `syncdoc_session=${data}.${sig}`;

const res = await fetch("http://localhost:3000/doc/1/export", {
  headers: { Cookie: cookie },
});
console.log(`HTTP ${res.status}`);
console.log("Content-Type:", res.headers.get("content-type"));
console.log("Content-Disposition:", res.headers.get("content-disposition"));
const md = await res.text();
console.log(`length: ${md.length} chars`);
for (const section of [
  "## Abstract",
  "## 합의된 원문",
  "## 번역 기록",
  "## 댓글",
]) {
  console.log(md.includes(section) ? `OK  ${section}` : `--  ${section} (없음)`);
}
console.log("\n--- 미리보기 (앞 600자) ---\n" + md.slice(0, 600));
