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

describe("문서 접근 게이트 (requireDocAccess) — 크로스 테넌트 IDOR 방어", () => {
  let aOwner: number, aOutsider: number, aProject: number, aDoc: number;
  let legacyUser: number, legacyDoc: number;
  beforeAll(() => {
    aOwner = mkUser("aowner", "planner");
    aOutsider = mkUser("aoutsider", "developer");
    aProject = Number(
      sqlite
        .prepare("INSERT INTO projects (title, type, link_shared, created_by, created_at) VALUES ('A', 'project', 0, ?, '2026-01-01')")
        .run(aOwner).lastInsertRowid
    );
    addMember(aProject, aOwner, "planner", "owner");
    aDoc = Number(
      sqlite
        .prepare("INSERT INTO documents (title, project_id, created_at) VALUES ('AD', ?, '2026-01-01')")
        .run(aProject).lastInsertRowid
    );
    // 레거시 문서 — project_id 없음(NULL)
    legacyUser = mkUser("legacy", "planner");
    legacyDoc = Number(
      sqlite
        .prepare("INSERT INTO documents (title, created_at) VALUES ('LD', '2026-01-01')")
        .run().lastInsertRowid
    );
  });

  it("멤버는 자기 직군을 얻는다", () => {
    expect(repo.requireDocAccess(aDoc, aOwner)).toBe("planner");
  });

  it("비멤버는 null(거부) — 남의 프로젝트 문서 접근 차단", () => {
    expect(repo.requireDocAccess(aDoc, aOutsider)).toBeNull();
  });

  it("레거시(프로젝트 없는) 문서는 계정 역할로 폴백한다", () => {
    expect(repo.requireDocAccess(legacyDoc, legacyUser)).toBe("planner");
  });
});

describe("보관/해제 권한 + 활동 로그 (getDocPermission / doc_activity)", () => {
  let bOwner: number, bEditor: number, bViewer: number, bOutsider: number;
  let bProject: number, bDoc: number, bLegacyDoc: number;
  beforeAll(() => {
    bOwner = mkUser("bowner", "planner");
    bEditor = mkUser("beditor", "developer");
    bViewer = mkUser("bviewer", "developer");
    bOutsider = mkUser("boutsider", "developer");
    bProject = Number(
      sqlite
        .prepare("INSERT INTO projects (title, type, link_shared, created_by, created_at) VALUES ('B', 'project', 0, ?, '2026-01-01')")
        .run(bOwner).lastInsertRowid
    );
    addMember(bProject, bOwner, "planner", "owner");
    addMember(bProject, bEditor, "developer", "editor");
    addMember(bProject, bViewer, "designer", "viewer");
    bDoc = Number(
      sqlite
        .prepare("INSERT INTO documents (title, project_id, created_at) VALUES ('BD', ?, '2026-01-01')")
        .run(bProject).lastInsertRowid
    );
    bLegacyDoc = Number(
      sqlite
        .prepare("INSERT INTO documents (title, created_at) VALUES ('BLD', '2026-01-01')")
        .run().lastInsertRowid
    );
  });

  it("권한 판정 — 소유자/편집자/뷰어, 비멤버는 null, 레거시는 owner", () => {
    expect(repo.getDocPermission(bDoc, bOwner)).toBe("owner");
    expect(repo.getDocPermission(bDoc, bEditor)).toBe("editor");
    expect(repo.getDocPermission(bDoc, bViewer)).toBe("viewer");
    expect(repo.getDocPermission(bDoc, bOutsider)).toBeNull();
    expect(repo.getDocPermission(bLegacyDoc, bOutsider)).toBe("owner");
  });

  it("보관→해제 시 활동이 append-only로 쌓이고 최신순으로 조회된다", () => {
    expect(repo.listDocActivity(bDoc)).toHaveLength(0);
    // 편집자가 보관
    expect(repo.setDocumentArchived(bDoc, true, { id: bEditor, role: "developer" })).toBe(true);
    // 소유자가 해제
    expect(repo.setDocumentArchived(bDoc, false, { id: bOwner, role: "planner" })).toBe(true);

    const log = repo.listDocActivity(bDoc);
    expect(log).toHaveLength(2);
    expect(log[0].action).toBe("unarchived"); // 최신순
    expect(log[0].actorName).toContain("bowner");
    expect(log[1].action).toBe("archived");
    expect(log[1].actorName).toContain("beditor");
  });

  it("상태가 실제로 바뀌지 않으면(중복) 활동을 남기지 않는다", () => {
    const doc2 = Number(
      sqlite
        .prepare("INSERT INTO documents (title, project_id, created_at) VALUES ('BD2', ?, '2026-01-01')")
        .run(bProject).lastInsertRowid
    );
    // 이미 active인데 다시 해제 시도 → 변화 없음 → 로그 없음
    expect(repo.setDocumentArchived(doc2, false, { id: bOwner, role: "planner" })).toBe(false);
    expect(repo.listDocActivity(doc2)).toHaveLength(0);
  });
});
