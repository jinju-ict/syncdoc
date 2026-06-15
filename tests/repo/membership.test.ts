import { describe, it, expect, beforeAll } from "vitest";
import * as repo from "@/lib/repo";
import { sqlite } from "@/lib/db";

let owner: number, editor: number, viewer: number, outsider: number;
let projectId: number, docId: number;

function mkUser(name: string, role: "planner" | "developer"): number {
  return Number(
    sqlite
      .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, 'x', ?)")
      .run(`${name}_${Date.now()}_${Math.floor(performance.now())}`, role).lastInsertRowid
  );
}
function addMember(pid: number, uid: number, role: string, perm: string) {
  sqlite
    .prepare(
      "INSERT INTO project_members (project_id, user_id, role, perm, created_at) VALUES (?, ?, ?, ?, '2026-01-01')"
    )
    .run(pid, uid, role, perm);
}

beforeAll(() => {
  owner = mkUser("owner", "planner");
  editor = mkUser("editor", "developer");
  viewer = mkUser("viewer", "developer");
  outsider = mkUser("outsider", "developer");
  projectId = Number(
    sqlite
      .prepare("INSERT INTO projects (title, type, link_shared, created_by, created_at) VALUES ('P', 'project', 1, ?, '2026-01-01')")
      .run(owner).lastInsertRowid
  );
  addMember(projectId, owner, "planner", "owner");
  addMember(projectId, editor, "developer", "editor");
  addMember(projectId, viewer, "designer", "viewer");
  docId = Number(
    sqlite
      .prepare("INSERT INTO documents (title, project_id, created_at) VALUES ('D', ?, '2026-01-01')")
      .run(projectId).lastInsertRowid
  );
});

describe("입장 승인 (join_requests)", () => {
  it("비멤버 요청 → 목록 노출 → 승인 시 editor로 합류", () => {
    const r = repo.createJoinRequest({ projectId, userId: outsider, requestedRole: "designer" });
    expect(r).toEqual({ ok: true, alreadyMember: false });

    const pending = repo.listJoinRequests(projectId);
    expect(pending.map((j) => j.userId)).toContain(outsider);
    const reqId = pending.find((j) => j.userId === outsider)!.id;

    const ap = repo.approveJoinRequest(reqId, projectId, owner);
    expect(ap.ok).toBe(true);
    expect(repo.getMembership(projectId, outsider)).toEqual({ role: "designer", perm: "editor" });
    // 승인 후 대기 목록에서 사라진다
    expect(repo.listJoinRequests(projectId).some((j) => j.userId === outsider)).toBe(false);
  });

  it("이미 멤버면 alreadyMember", () => {
    expect(repo.createJoinRequest({ projectId, userId: owner, requestedRole: "planner" })).toEqual({
      ok: false,
      alreadyMember: true,
    });
  });
});

describe("합의 (getDocConsensus)", () => {
  // 입장 승인 테스트가 위 projectId 멤버십을 바꾸므로, 합의는 별도 프로젝트로 격리한다.
  let cOwner: number, cEditor: number, cViewer: number, cProject: number, cDoc: number;
  beforeAll(() => {
    cOwner = mkUser("cowner", "planner");
    cEditor = mkUser("ceditor", "developer");
    cViewer = mkUser("cviewer", "developer");
    cProject = Number(
      sqlite
        .prepare("INSERT INTO projects (title, type, link_shared, created_by, created_at) VALUES ('C', 'project', 0, ?, '2026-01-01')")
        .run(cOwner).lastInsertRowid
    );
    addMember(cProject, cOwner, "planner", "owner");
    addMember(cProject, cEditor, "developer", "editor");
    addMember(cProject, cViewer, "designer", "viewer");
    cDoc = Number(
      sqlite
        .prepare("INSERT INTO documents (title, project_id, created_at) VALUES ('CD', ?, '2026-01-01')")
        .run(cProject).lastInsertRowid
    );
  });

  it("참여자=소유자·편집자, 뷰어 제외; 전원 서명해야 agreed", () => {
    const before = repo.getDocConsensus(cDoc);
    expect(before.participants.map((p) => p.userId).sort()).toEqual([cOwner, cEditor].sort());
    expect(before.agreed).toBe(false);

    repo.addSignature(cDoc, cOwner, "planner");
    expect(repo.getDocConsensus(cDoc).agreed).toBe(false); // 아직 1명
    repo.addSignature(cDoc, cEditor, "developer");
    expect(repo.getDocConsensus(cDoc).agreed).toBe(true); // 전원
  });
});

describe("소유자 가드 프리미티브", () => {
  it("countOwners / isProjectOwner", () => {
    expect(repo.countOwners(projectId)).toBe(1);
    expect(repo.isProjectOwner(projectId, owner)).toBe(true);
    expect(repo.isProjectOwner(projectId, editor)).toBe(false);
  });
});
