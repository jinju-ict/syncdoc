"use server";

/**
 * 프로젝트 워크스페이스 서버 액션 — 멤버/초대 관리.
 * (회의록·릴리스는 따로 만들지 않고 백서 대화에서 자동 파생된다)
 */

import { revalidatePath } from "next/cache";
import * as repo from "@/lib/repo";
import type { Permission, ProjectRole } from "@/lib/repo";
import { getSession } from "@/lib/session";

const ROLES: readonly ProjectRole[] = ["planner", "developer", "designer", "ops"];
const PERMS: readonly Permission[] = ["owner", "editor", "viewer", "link"];

type Result = { ok: true } | { ok: false; error: string };

async function requireOwner(
  projectId: number
): Promise<{ ok: true; uid: number } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "로그인이 필요합니다" };
  if (!repo.isProjectOwner(projectId, session.uid))
    return { ok: false, error: "소유자만 멤버를 관리할 수 있습니다" };
  return { ok: true, uid: session.uid };
}

/** 멤버 직군·권한 변경 (소유자) — 마지막 소유자를 강등하지 못한다 */
export async function updateMemberAction(input: {
  projectId: number;
  userId: number;
  role: string;
  perm: string;
}): Promise<Result> {
  const auth = await requireOwner(input.projectId);
  if (!auth.ok) return auth;
  if (!ROLES.includes(input.role as ProjectRole) || !PERMS.includes(input.perm as Permission))
    return { ok: false, error: "잘못된 직군/권한" };

  const cur = repo.getMembership(input.projectId, input.userId);
  if (!cur) return { ok: false, error: "멤버를 찾을 수 없습니다" };
  if (cur.perm === "owner" && input.perm !== "owner" && repo.countOwners(input.projectId) <= 1)
    return { ok: false, error: "마지막 소유자는 권한을 바꿀 수 없습니다" };

  repo.updateMember(input.projectId, input.userId, input.role as ProjectRole, input.perm as Permission);
  revalidatePath(`/project/${input.projectId}`);
  return { ok: true };
}

/** 멤버 제거 (소유자) — 마지막 소유자는 제거 불가 */
export async function removeMemberAction(input: {
  projectId: number;
  userId: number;
}): Promise<Result> {
  const auth = await requireOwner(input.projectId);
  if (!auth.ok) return auth;
  const cur = repo.getMembership(input.projectId, input.userId);
  if (!cur) return { ok: false, error: "멤버를 찾을 수 없습니다" };
  if (cur.perm === "owner" && repo.countOwners(input.projectId) <= 1)
    return { ok: false, error: "마지막 소유자는 제거할 수 없습니다" };

  repo.removeMember(input.projectId, input.userId);
  revalidatePath(`/project/${input.projectId}`);
  return { ok: true };
}

/** 대기 중 초대 취소 (소유자) */
export async function revokeInviteAction(input: {
  projectId: number;
  inviteId: number;
}): Promise<Result> {
  const auth = await requireOwner(input.projectId);
  if (!auth.ok) return auth;
  repo.revokeInvite(input.inviteId, input.projectId);
  revalidatePath(`/project/${input.projectId}`);
  return { ok: true };
}
