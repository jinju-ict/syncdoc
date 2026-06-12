// 보관(archive) 기능 검증 — 롤백 안전 (DB 원상 유지)
// 1) documents 컬럼/트리거 존재  2) 보관 문서에 블록 INSERT 거부  3) 해제 후 INSERT 허용
const Database = require("better-sqlite3");
const path = require("node:path");

const db = new Database(
  process.env.SYNCDOC_DB_PATH ?? path.join(process.cwd(), "syncdoc.db")
);

const cols = db.prepare("PRAGMA table_info(documents)").all().map((c) => c.name);
console.log("documents cols:", cols.join(", "));
const need = ["status", "archived_at", "created_at"];
const missing = need.filter((n) => !cols.includes(n));
console.log(
  missing.length === 0
    ? "✅ 마이그레이션 컬럼 3종 존재: PASS"
    : `❌ 컬럼 누락: ${missing.join(", ")}`
);

const triggers = db
  .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
  .all()
  .map((t) => t.name);
console.log(
  triggers.includes("blocks_no_insert_on_archived")
    ? "✅ 보관 트리거 존재: PASS"
    : "❌ 보관 트리거 없음"
);

db.exec("BEGIN");
try {
  db.prepare(
    "UPDATE documents SET status='archived', archived_at=? WHERE id=1"
  ).run(new Date().toISOString());

  let blocked = false;
  try {
    db.prepare(
      "INSERT INTO blocks (doc_id, author_id, author_role, source_md, status) VALUES (1, 1, 'planner', 'test', 'draft')"
    ).run();
  } catch (e) {
    blocked = String(e.message).includes("read-only");
  }
  console.log(
    blocked
      ? "✅ 보관 문서 블록 INSERT 거부: PASS"
      : "❌ 보관 문서에 INSERT 허용됨: FAIL"
  );

  db.prepare(
    "UPDATE documents SET status='active', archived_at=NULL WHERE id=1"
  ).run();
  db.prepare(
    "INSERT INTO blocks (doc_id, author_id, author_role, source_md, status) VALUES (1, 1, 'planner', 'test', 'draft')"
  ).run();
  console.log("✅ 보관 해제 후 INSERT 허용: PASS");
} finally {
  db.exec("ROLLBACK");
}

const st = db.prepare("SELECT status FROM documents WHERE id=1").get();
const leftover = db
  .prepare("SELECT COUNT(*) AS c FROM blocks WHERE source_md = 'test'")
  .get();
console.log(
  st.status === "active" && leftover.c === 0
    ? "✅ 롤백 후 원상 유지 (잔존 데이터 없음): PASS"
    : `❌ 롤백 검증 실패: status=${st.status}, leftover=${leftover.c}`
);
db.close();
