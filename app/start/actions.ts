"use server";

/**
 * 시작 셸 서버 액션 — 계정·프로젝트·멤버십·초대를 실제 DB에 기록한다.
 * 클라이언트(StartShell)는 결과를 받아 화면 전환 후 router.refresh()로 재동기화한다.
 */

import { redirect } from "next/navigation";
import * as repo from "@/lib/repo";
import type { Permission, ProjectRole } from "@/lib/repo";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession, getSession } from "@/lib/session";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const ROLES: readonly ProjectRole[] = ["planner", "developer", "designer", "ops"];
const PERMS: readonly Permission[] = ["owner", "editor", "viewer", "link"];
const asRole = (v: unknown): ProjectRole =>
  ROLES.includes(v as ProjectRole) ? (v as ProjectRole) : "developer";
const asPerm = (v: unknown): Permission =>
  PERMS.includes(v as Permission) ? (v as Permission) : "editor";

// ---------------------------------------------------------------------------
// 인증
// ---------------------------------------------------------------------------

export async function signup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "이메일을 입력하세요" };
  if (!input.password) return { ok: false, error: "비밀번호를 입력하세요" };
  const account = repo.createAccount({
    name: input.name,
    email,
    passwordHash: hashPassword(input.password),
  });
  if (!account) return { ok: false, error: "이미 가입된 이메일입니다" };
  await createSession(account);
  return { ok: true };
}

export async function loginEmail(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "이메일을 입력하세요" };
  const user = repo.getUserByEmail(email);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return { ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다" };
  }
  await createSession(user);
  return { ok: true };
}

export async function logoutToStart(): Promise<void> {
  await destroySession();
  redirect("/start");
}

// ---------------------------------------------------------------------------
// 프로젝트 / 멤버십 / 초대
// ---------------------------------------------------------------------------

export async function createProjectAction(input: {
  title: string;
  role: string;
}): Promise<ActionResult<{ projectId: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다" };
  const { projectId } = repo.createProject({
    title: input.title,
    ownerId: session.uid,
    ownerRole: asRole(input.role),
  });
  return { ok: true, data: { projectId } };
}

export async function inviteAction(input: {
  projectId: number;
  email: string;
  role: string;
  perm: string;
}): Promise<ActionResult<{ added: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다" };
  if (!repo.isProjectOwner(input.projectId, session.uid)) {
    return { ok: false, error: "초대 권한이 없습니다 (소유자만 가능)" };
  }
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "이메일을 입력하세요" };
  const role = asRole(input.role);
  const perm = asPerm(input.perm);

  // 이미 가입한 계정이면 즉시 멤버 추가, 아니면 대기 중 초대로 남긴다
  const { added } = repo.addMemberByEmail({ projectId: input.projectId, email, role, perm });
  if (!added) {
    repo.createInvite({ projectId: input.projectId, email, role, perm, invitedBy: session.uid });
  }
  return { ok: true, data: { added } };
}

export async function acceptInviteAction(input: {
  inviteId: number;
}): Promise<ActionResult<{ projectId: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다" };
  const projectId = repo.acceptInvite(input.inviteId, session.uid);
  if (!projectId) return { ok: false, error: "이미 처리된 초대입니다" };
  return { ok: true, data: { projectId } };
}

export async function declineInviteAction(input: {
  inviteId: number;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다" };
  const acct = repo.getUserById(session.uid);
  if (acct?.email) repo.declineInvite(input.inviteId, acct.email);
  return { ok: true };
}

export async function toggleLinkAction(input: {
  projectId: number;
  shared: boolean;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다" };
  if (!repo.isProjectOwner(input.projectId, session.uid)) {
    return { ok: false, error: "변경 권한이 없습니다 (소유자만 가능)" };
  }
  repo.setProjectLinkShared(input.projectId, input.shared);
  return { ok: true };
}
