/**
 * 첨부 파일 저장 (로컬 디스크) — uploads/ 디렉터리(.gitignore).
 * 서버 전용. 파일 본문은 DB에 넣지 않고 디스크에 저장하고 경로만 기록한다.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const UPLOAD_DIR =
  process.env.SYNCDOC_UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/** 텍스트 기반(.txt/.md/그 외 text/*·json 등) — AI가 본문을 읽어 백서 근거로 쓸 수 있다 */
export function isTextMime(mime: string, filename: string): boolean {
  if (mime.startsWith("text/")) return true;
  if (/(application\/json|application\/xml|\+xml|\+json)/.test(mime)) return true;
  return /\.(md|markdown|txt|csv|json|ya?ml|tsv|log)$/i.test(filename);
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

/** 안전한 파일명으로 정규화 (경로 분리 제거 + 공백 정리) */
function safeName(name: string): string {
  const base = name
    .replace(/[/\\]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-_]/g, "")
    .trim();
  return base.slice(0, 120) || "file";
}

/** 업로드 버퍼를 디스크에 저장하고 저장 경로를 반환 */
export async function saveUploadedFile(
  buf: Buffer,
  filename: string
): Promise<{ path: string }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const dest = path.join(UPLOAD_DIR, `${randomUUID()}-${safeName(filename)}`);
  await writeFile(dest, buf);
  return { path: dest };
}
