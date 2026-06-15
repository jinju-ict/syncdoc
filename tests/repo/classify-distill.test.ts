import { describe, it, expect, beforeAll } from "vitest";
import * as repo from "@/lib/repo";
import { sqlite } from "@/lib/db";

let docId: number;
let b1: number, b2: number, b3: number;

function addLockedBlock(did: number, uid: number, md: string, seq: number): number {
  const r = sqlite
    .prepare(
      `INSERT INTO blocks (doc_id, author_id, author_role, author_project_role, source_md, status, locked_at, version_tag, seq)
       VALUES (?, ?, 'developer', 'developer', ?, 'locked', ?, '[t]', ?)`
    )
    .run(did, uid, md, `2026-01-01T00:0${seq}:00`, seq);
  return Number(r.lastInsertRowid);
}

beforeAll(() => {
  const uid = Number(
    sqlite
      .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, 'x', 'developer')")
      .run(`cd_${Date.now()}`).lastInsertRowid
  );
  docId = Number(
    sqlite
      .prepare("INSERT INTO documents (title, created_at) VALUES ('classify test', '2026-01-01')")
      .run().lastInsertRowid
  );
  b1 = addLockedBlock(docId, uid, "429 응답과 재시도 로직", 1);
  b2 = addLockedBlock(docId, uid, "이건 백서에서 빼자", 2);
  b3 = addLockedBlock(docId, uid, "이번 팝업의 목표는 멤버십 전환", 3);

  // AI 분류 결과 주입
  repo.upsertMessageRelevanceAI({ messageId: b1, aiSectionKey: "how", aiRelevance: 0.9 });
  repo.upsertMessageRelevanceAI({ messageId: b2, aiSectionKey: "how", aiRelevance: 0.6 });
  repo.upsertMessageRelevanceAI({ messageId: b3, aiSectionKey: "why", aiRelevance: 0.8 });
  // b2는 사람이 제외했다고 가정 (excluded 컬럼 직접 세팅 — 교정 setter는 제거됨)
  sqlite.prepare("UPDATE message_relevance SET excluded = 1 WHERE message_id = ?").run(b2);
});

describe("분류 기반 증류 입력 선택", () => {
  it("getClassifiedSectionMessages는 해당 절·제외 안 된 메시지만", () => {
    const how = repo.getClassifiedSectionMessages(docId, "how");
    expect(how.map((m) => m.id)).toEqual([b1]); // b2는 excluded
    const why = repo.getClassifiedSectionMessages(docId, "why");
    expect(why.map((m) => m.id)).toEqual([b3]);
    expect(repo.getClassifiedSectionMessages(docId, "rules")).toHaveLength(0);
  });

  it("classifiedSectionSig는 '개수:최대id'", () => {
    expect(repo.classifiedSectionSig(docId, "how")).toBe(`1:${b1}`);
    expect(repo.classifiedSectionSig(docId, "rules")).toBe("0:0");
  });

  it("ensureSectionDistills는 내용 있는 절만, 캐시되면 제외", () => {
    const jobs = repo.ensureSectionDistills(docId);
    const keys = jobs.map((j) => j.sectionKey).sort();
    expect(keys).toEqual(["how", "why"]); // what/rules 비어 있음

    // how를 증류 저장하면 시그니처 일치 → 다음 호출에서 제외
    const sig = repo.classifiedSectionSig(docId, "how");
    repo.upsertDistilledSection(docId, "how", { title: "방식", bodyMd: "…", sig });
    const after = repo.ensureSectionDistills(docId).map((j) => j.sectionKey);
    expect(after).toEqual(["why"]);
  });
});

describe("백서 화면 교정 — 제외/재분류", () => {
  it("setMessageExcluded: 출처엔 남고(excluded) 증류 입력에선 빠진다", () => {
    repo.setMessageExcluded(b3, true);
    expect(repo.getSectionSourceMessages(docId, "why").find((m) => m.id === b3)?.excluded).toBe(true);
    expect(repo.getClassifiedSectionMessages(docId, "why").map((m) => m.id)).not.toContain(b3);
    repo.setMessageExcluded(b3, false);
    expect(repo.getClassifiedSectionMessages(docId, "why").map((m) => m.id)).toContain(b3);
  });

  it("setMessageOverrideSection: 메시지를 다른 절로 이동, null이면 AI값 복원", () => {
    repo.setMessageOverrideSection(b3, "what");
    expect(repo.getSectionSourceMessages(docId, "why").map((m) => m.id)).not.toContain(b3);
    expect(repo.getSectionSourceMessages(docId, "what").map((m) => m.id)).toContain(b3);
    repo.setMessageOverrideSection(b3, null);
    expect(repo.getSectionSourceMessages(docId, "why").map((m) => m.id)).toContain(b3);
  });
});
