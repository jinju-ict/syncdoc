import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

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

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'project',
  link_shared INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('planner','developer','designer','ops')),
  perm TEXT NOT NULL CHECK (perm IN ('owner','editor','viewer','link')),
  created_at TEXT NOT NULL,
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('planner','developer','designer','ops')),
  perm TEXT NOT NULL CHECK (perm IN ('owner','editor','viewer','link')),
  invited_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL
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

-- N직군 × 자연어 번역: 블록 × 대상 직군(4) × 언어(3)별 번역 1행.
CREATE TABLE IF NOT EXISTS block_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  block_id INTEGER NOT NULL REFERENCES blocks(id),
  target_role TEXT NOT NULL CHECK (target_role IN ('planner','developer','designer','ops')),
  target_lang TEXT NOT NULL DEFAULT 'ko' CHECK (target_lang IN ('ko','en','ja')),
  translated_md TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed')),
  created_at TEXT NOT NULL,
  attempt_at TEXT,
  UNIQUE (block_id, target_role, target_lang)
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

-- 백서 정규 절(1~4)의 증류된 세부 항목 — 대화에서 1회 증류되어 캐시되는 산문.
-- 백서 렌즈는 이 행들을 절 단위로 묶어 "일반 문서"처럼 보여준다(블록 UI 아님).
CREATE TABLE IF NOT EXISTS section_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id),
  section_key TEXT NOT NULL CHECK (section_key IN ('why','what','how','rules')),
  sub_key TEXT,
  title TEXT,
  body_md TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discussing' CHECK (status IN ('agreed','discussing','draft')),
  source_thread_id INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- 릴리스 스냅샷 — 절이 증류·합의될 때마다 append-only로 그 시점 결정을 박제한다.
-- (회의록은 blocks에서 파생되므로 별도 테이블이 없다)
CREATE TABLE IF NOT EXISTS release_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id),
  section_key TEXT NOT NULL,
  title TEXT,
  body_md TEXT NOT NULL,
  version_label TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- 백서 절 산문의 자연어 번역 캐시 (정본은 section_content, 여기는 ko 외 언어).
CREATE TABLE IF NOT EXISTS section_content_i18n (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES section_content(id),
  lang TEXT NOT NULL CHECK (lang IN ('ko','en','ja')),
  title TEXT,
  body_md TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed')),
  source_sig TEXT,
  created_at TEXT NOT NULL,
  attempt_at TEXT,
  UNIQUE (content_id, lang)
);

CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('planner','developer','designer','ops')),
  signed_at TEXT NOT NULL,
  UNIQUE (doc_id, user_id)
);

-- v0.2 채팅 기반 백서: 메시지(blocks)별 관련도·절 분류.
-- AI가 ai_section_key/ai_relevance를 채우고, 사람은 pinned(반영 강제)·excluded(제외)·
-- override_section_key(절 재분류)로 교정한다. 증류는 이 표를 기준으로 메시지를 모은다.
CREATE TABLE IF NOT EXISTS message_relevance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES blocks(id),
  ai_section_key TEXT,
  ai_relevance REAL,
  ai_reason TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  excluded INTEGER NOT NULL DEFAULT 0,
  override_section_key TEXT,
  classified_at TEXT,
  updated_at TEXT,
  UNIQUE (message_id)
);

-- v0.2 채팅 첨부 — 파일/링크. 텍스트·링크는 AI가 읽어 백서 근거(text_excerpt)로 쓴다.
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id),
  message_id INTEGER REFERENCES blocks(id),
  kind TEXT NOT NULL CHECK (kind IN ('file','link')),
  url TEXT,
  path TEXT,
  mime TEXT,
  title TEXT,
  text_excerpt TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- v0.2 입장 승인 — 사용자가 프로젝트(채팅방) 입장을 요청하고 소유자가 승인/거절한다.
-- 기존 invites(소유자→사용자)와 반대 방향(사용자→소유자). 승인 시 project_members로 합류.
CREATE TABLE IF NOT EXISTS join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  requested_role TEXT NOT NULL CHECK (requested_role IN ('planner','developer','designer','ops')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  UNIQUE (project_id, user_id)
);

-- v0.2 번역 캐시 — 메시지 내용 해시(정규화) × 직군 × 언어 × 숙련도로 번역을 재사용.
-- 같은 문장이 반복되면(정형 문구·재게시 등) AI를 다시 부르지 않는다(토큰·지연 절약).
-- 블록 FK가 없는 전역 캐시 — block_translations(블록별 보관)와 별개.
CREATE TABLE IF NOT EXISTS translation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_hash TEXT NOT NULL,
  target_role TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  level TEXT NOT NULL,
  translated_md TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_hash, target_role, target_lang, level)
);

-- 잠금 불변식 2중 방어 (계획 §핵심 불변식): 잠긴 블록은 UPDATE/DELETE 모두 영구 불가.
-- 번역본은 별도 테이블(block_translations)이므로 이 트리거는 번역 기록을 막지 않는다.
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
  const hasUserCol = (n: string) => userCols.some((c) => c.name === n);
  if (!hasUserCol("level")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN level TEXT NOT NULL DEFAULT 'intermediate' CHECK (level IN ('beginner','intermediate','expert'))"
    );
  }
  // 이메일 가입 계정 — UNIQUE 컬럼은 ALTER로 추가 불가하므로 컬럼 추가 후 별도 인덱스
  if (!hasUserCol("email")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN email TEXT");
  }
  if (!hasUserCol("name")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN name TEXT");
  }
  // 자연어 설정 (콘텐츠 번역 대상 언어)
  if (!hasUserCol("lang")) {
    sqlite.exec(
      "ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'ko' CHECK (lang IN ('ko','en','ja'))"
    );
  }
  // NULL 이메일 다수는 SQLite UNIQUE에서 충돌하지 않는다 (시드 계정은 email 없음)
  sqlite.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)"
  );

  // 문서 ↔ 프로젝트 연결 (레거시 문서는 NULL). 기본값 NULL이므로 REFERENCES 추가 허용.
  const docColsForProject = sqlite
    .prepare("PRAGMA table_info(documents)")
    .all() as { name: string }[];
  if (!docColsForProject.some((c) => c.name === "project_id")) {
    sqlite.exec(
      "ALTER TABLE documents ADD COLUMN project_id INTEGER REFERENCES projects(id)"
    );
  }
  // 프로젝트 내 문서 종류 (레거시·기존 문서는 'main')
  if (!docColsForProject.some((c) => c.name === "kind")) {
    sqlite.exec(
      "ALTER TABLE documents ADD COLUMN kind TEXT NOT NULL DEFAULT 'main' CHECK (kind IN ('main','meeting','release'))"
    );
  }

  // N직군: 블록 작성자의 4직군 값. CHECK는 ALTER로 못 바꾸므로 제약 없는 일반 컬럼으로
  // 두고 코드에서 4직군만 기록한다. 기존(잠긴) 블록은 NULL로 두고 읽기 시
  // COALESCE(author_project_role, author_role)로 2축 값에 폴백한다.
  // (잠긴 블록을 UPDATE하면 불변식 트리거가 막으므로 백필하지 않는다)
  const blockCols = sqlite.prepare("PRAGMA table_info(blocks)").all() as {
    name: string;
  }[];
  if (!blockCols.some((c) => c.name === "author_project_role")) {
    sqlite.exec("ALTER TABLE blocks ADD COLUMN author_project_role TEXT");
  }
  // 절 스코프: 블록이 어느 백서 절의 대화에 속하는지 (NULL = 전체/대화 렌즈).
  // CHECK 없이 일반 컬럼으로 두고 코드에서 유효 키만 기록한다.
  if (!blockCols.some((c) => c.name === "section_key")) {
    sqlite.exec("ALTER TABLE blocks ADD COLUMN section_key TEXT");
  }

  // 증류 캐시 키 — 증류 시점의 절 대화 시그니처(개수:최대블록id). 같으면 AI 재호출 안 함.
  const scCols = sqlite
    .prepare("PRAGMA table_info(section_content)")
    .all() as { name: string }[];
  if (!scCols.some((c) => c.name === "source_sig")) {
    sqlite.exec("ALTER TABLE section_content ADD COLUMN source_sig TEXT");
  }


  // 언어 차원 추가 — 구 block_translations(키 block_id+role)를 (block_id+role+lang)으로 재생성.
  // 기존 행은 ko로 이관. block_translations에 들어오는 FK가 없어 재생성 안전.
  const btCols = sqlite
    .prepare("PRAGMA table_info(block_translations)")
    .all() as { name: string }[];
  if (!btCols.some((c) => c.name === "target_lang")) {
    const recreate = sqlite.transaction(() => {
      sqlite.exec(`CREATE TABLE block_translations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER NOT NULL REFERENCES blocks(id),
        target_role TEXT NOT NULL CHECK (target_role IN ('planner','developer','designer','ops')),
        target_lang TEXT NOT NULL DEFAULT 'ko' CHECK (target_lang IN ('ko','en','ja')),
        translated_md TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed')),
        created_at TEXT NOT NULL,
        attempt_at TEXT,
        UNIQUE (block_id, target_role, target_lang)
      )`);
      sqlite.exec(
        `INSERT INTO block_translations_new (block_id, target_role, target_lang, translated_md, status, created_at, attempt_at)
         SELECT block_id, target_role, 'ko', translated_md, status, created_at, attempt_at FROM block_translations`
      );
      sqlite.exec("DROP TABLE block_translations");
      sqlite.exec("ALTER TABLE block_translations_new RENAME TO block_translations");
    });
    recreate();
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

/**
 * 시드 — 의도적으로 비움. **완전 백지 초기 상태**(데모 계정·프로젝트·콘텐츠 없음)로 시작한다.
 * 사용자는 회원가입 → 프로젝트 생성(= 채팅방 자동 생성, repo.createProject)으로 시작한다.
 * 스키마·마이그레이션·트리거는 createConnection의 DDL/migrate에서 이미 준비된다.
 */
function seed(_sqlite: Database.Database) {
  // no-op
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
