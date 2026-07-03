import { readFile } from "node:fs/promises";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";

/**
 * 첨부 파일 서빙 — uploads/ 디스크에서 읽어 스트리밍한다.
 * 세션 필수 + 첨부가 이 문서에 속하는지 확인. (퍼블릭 노출 없음)
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; aid: string }> }
) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id, aid } = await ctx.params;
  const docId = Number(id);
  const attId = Number(aid);
  if (!Number.isInteger(docId) || !Number.isInteger(attId))
    return new Response("Bad request", { status: 400 });

  const att = repo.getAttachment(attId);
  if (!att || att.docId !== docId || att.kind !== "file" || !att.path)
    return new Response("Not found", { status: 404 });

  // 접근 게이트 — 이 문서(프로젝트)의 멤버만. 비멤버는 존재를 숨겨 404 (파일 IDOR 방어).
  if (!repo.requireDocAccess(att.docId, session.uid))
    return new Response("Not found", { status: 404 });

  try {
    const buf = await readFile(att.path);
    const filename = encodeURIComponent(att.title ?? "file");
    // 안전한 서빙: 진짜 이미지(SVG 제외)만 화면에 inline, 그 외는 전부 다운로드로 강제.
    // nosniff로 브라우저의 MIME 추측 실행(업로드 HTML/스크립트) 차단 → 저장형 XSS 방어.
    const mime = att.mime ?? "application/octet-stream";
    const inlineSafe = mime.startsWith("image/") && mime !== "image/svg+xml";
    return new Response(buf, {
      headers: {
        "Content-Type": inlineSafe ? mime : "application/octet-stream",
        "Content-Disposition": `${inlineSafe ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
