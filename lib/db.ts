import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { hashPassword } from "./password";

const DB_PATH =
  process.env.SYNCDOC_DB_PATH ?? path.join(process.cwd(), "syncdoc.db");

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('planner','developer')),
  level TEXT NOT NULL DEFAULT 'intermediate' CHECK (level IN ('beginner','intermediate','expert'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  approval_planner_at TEXT,
  approval_developer_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  archived_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('planner','developer')),
  source_md TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','locked')),
  locked_at TEXT,
  version_tag TEXT,
  seq INTEGER
);

CREATE TABLE IF NOT EXISTS translations (
  block_id INTEGER PRIMARY KEY REFERENCES blocks(id),
  target_role TEXT NOT NULL CHECK (target_role IN ('planner','developer')),
  translated_md TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed')),
  created_at TEXT NOT NULL,
  attempt_at TEXT
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id INTEGER NOT NULL REFERENCES blocks(id),
  options_json TEXT NOT NULL,
  accepted_option INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id INTEGER NOT NULL REFERENCES blocks(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  parent_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS abstracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id),
  abstract_md TEXT NOT NULL,
  toc_md TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

-- 잠금 불변식 2중 방어 (계획 §핵심 불변식): 잠긴 블록은 UPDATE/DELETE 모두 영구 불가.
-- 번역본은 별도 테이블(translations)이므로 이 트리거는 번역 기록을 막지 않는다.
CREATE TRIGGER IF NOT EXISTS blocks_locked_immutable_update
BEFORE UPDATE ON blocks
WHEN old.status = 'locked'
BEGIN
  SELECT RAISE(ABORT, 'locked block immutable');
END;

CREATE TRIGGER IF NOT EXISTS blocks_locked_immutable_delete
BEFORE DELETE ON blocks
WHEN old.status = 'locked'
BEGIN
  SELECT RAISE(ABORT, 'locked block immutable');
END;
`;

// 주의: documents.status를 참조하므로 migrate()(컬럼 보강) 이후에 생성해야 한다.
const POST_MIGRATE_DDL = `
-- 보관 문서 읽기 전용 (repo 가드의 DB 레벨 2중 방어): 새 블록 추가 차단.
-- 기존 블록의 잠금 불변식 트리거는 그대로 유지된다.
CREATE TRIGGER IF NOT EXISTS blocks_no_insert_on_archived
BEFORE INSERT ON blocks
WHEN (SELECT status FROM documents WHERE id = NEW.doc_id) = 'archived'
BEGIN
  SELECT RAISE(ABORT, 'archived document is read-only');
END;
`;

function createConnection() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  migrate(sqlite);
  sqlite.exec(POST_MIGRATE_DDL);
  seed(sqlite);
  return sqlite;
}

/** CREATE TABLE IF NOT EXISTS는 기존 테이블을 바꾸지 않으므로, 추가 컬럼은 여기서 멱등 ALTER */
function migrate(sqlite: Database.Database) {
  const userCols = sqlite.prepare("PRAGMA table_info(users)").all() as {
    name: string;
  }[];
  if (!userCols.some((c) => c.name === "level")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN level TEXT NOT NULL DEFAULT 'intermediate' CHECK (level IN ('beginner','intermediate','expert'))"
    );
  }

  const docCols = sqlite.prepare("PRAGMA table_info(documents)").all() as {
    name: string;
  }[];
  const hasDocCol = (n: string) => docCols.some((c) => c.name === n);
  if (!hasDocCol("status")) {
    sqlite.exec(
      "ALTER TABLE documents ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived'))"
    );
  }
  if (!hasDocCol("archived_at")) {
    sqlite.exec("ALTER TABLE documents ADD COLUMN archived_at TEXT");
  }
  if (!hasDocCol("created_at")) {
    // ADD COLUMN의 DEFAULT는 상수만 허용 — 기존 행은 별도 backfill
    sqlite.exec("ALTER TABLE documents ADD COLUMN created_at TEXT");
    sqlite
      .prepare("UPDATE documents SET created_at = ? WHERE created_at IS NULL")
      .run(new Date().toISOString());
  }
}

function seed(sqlite: Database.Database) {
  // INSERT OR IGNORE — 빌드/dev 시 다중 프로세스가 동시에 시드해도 안전 (멱등)
  const insertUser = sqlite.prepare(
    "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)"
  );
  insertUser.run("planner", hashPassword("demo1234"), "planner");
  insertUser.run("developer", hashPassword("demo1234"), "developer");
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO documents (id, title, created_at) VALUES (1, ?, ?)"
    )
    .run("샘플 프로젝트 문서", new Date().toISOString());
}

// Next.js dev HMR에서 커넥션이 중복 생성되지 않도록 globalThis에 캐시
const globalForDb = globalThis as unknown as {
  __syncdocSqlite?: Database.Database;
};

export const sqlite: Database.Database =
  globalForDb.__syncdocSqlite ?? createConnection();
globalForDb.__syncdocSqlite = sqlite;

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, {
  schema,
});

export { schema };
