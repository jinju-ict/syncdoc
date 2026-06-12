"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";

/** 새 문서 시작 — 생성 즉시 해당 문서로 이동 (v1: 독립 문서, 이전 문서와 연결 없음) */
export async function createNewDocument(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) redirect("/?error=empty-title");

  const docId = repo.createDocument(title);
  redirect(`/doc/${docId}`);
}
