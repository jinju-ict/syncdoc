/* 검증: 잠긴 블록 불변식 (계획 Verification Step 3)
 * 트리거가 UPDATE/DELETE를 거부하는지 확인. 모든 변경은 롤백되어 DB는 원상 유지.
 */
const Database = require("better-sqlite3");
const db = new Database("syncdoc.db");

const results = [];
function check(name, fn, expectAbort) {
  try {
    fn();
    results.push([name, expectAbort ? "FAIL (허용됨!)" : "PASS"]);
  } catch (e) {
    const aborted = /locked block immutable/.test(e.message);
    results.push([name, expectAbort && aborted ? "PASS (거부됨)" : `FAIL (${e.message})`]);
  }
}

db.exec("BEGIN");
try {
  const doc = db.prepare("SELECT id FROM documents LIMIT 1").get();
  const user = db.prepare("SELECT id, role FROM users LIMIT 1").get();
  if (!doc || !user) throw new Error("seed data missing");

  const ins = db
    .prepare(
      `INSERT INTO blocks (doc_id, author_id, author_role, source_md, status, locked_at, version_tag, seq)
       VALUES (?, ?, ?, '테스트 블록', 'locked', '2026-06-10T00:00:00Z', '[test]', 9999)`
    )
    .run(doc.id, user.id, user.role);
  const blockId = ins.lastInsertRowid;

  check("잠긴 블록 UPDATE 거부", () =>
    db.prepare("UPDATE blocks SET source_md = '변조' WHERE id = ?").run(blockId), true);
  check("잠긴 블록 DELETE 거부", () =>
    db.prepare("DELETE FROM blocks WHERE id = ?").run(blockId), true);

  // draft 블록은 수정 가능해야 함 (대조군)
  const insDraft = db
    .prepare(
      `INSERT INTO blocks (doc_id, author_id, author_role, source_md, status)
       VALUES (?, ?, ?, '초안', 'draft')`
    )
    .run(doc.id, user.id, user.role);
  check("draft 블록 UPDATE 허용", () =>
    db.prepare("UPDATE blocks SET source_md = '수정된 초안' WHERE id = ?").run(insDraft.lastInsertRowid), false);
} finally {
  db.exec("ROLLBACK");
}

const after = db.prepare("SELECT COUNT(*) AS c FROM blocks WHERE seq = 9999").get();
results.push(["롤백 후 테스트 데이터 잔존 없음", after.c === 0 ? "PASS" : "FAIL"]);

for (const [name, r] of results) console.log(`${r.startsWith("PASS") ? "✅" : "❌"} ${name}: ${r}`);
process.exit(results.every(([, r]) => r.startsWith("PASS")) ? 0 : 1);
