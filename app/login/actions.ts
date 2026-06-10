"use server";

import { redirect } from "next/navigation";
import { getUserByUsername } from "@/lib/repo";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";

export async function login(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const user = username ? getUserByUsername(username) : null;
  if (!user || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=1");
  }
  await createSession(user);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
