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

  try {
    const buf = await readFile(att.path);
    const filename = encodeURIComponent(att.title ?? "file");
    return new Response(buf, {
      headers: {
        "Content-Type": att.mime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
