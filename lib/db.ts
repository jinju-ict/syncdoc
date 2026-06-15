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

CREATE TABLE IF NOT EXISTS translations (
  block_id INTEGER PRIMARY KEY REFERENCES blocks(id),
  target_role TEXT NOT NULL CHECK (target_role IN ('planner','developer')),
  translated_md TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','failed')),
  created_at TEXT NOT NULL,
  attempt_at TEXT
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

  // 구 translations(2축, PK=block_id) → block_translations(4직군)로 1회 이관 (멱등).
  const btCount = (
    sqlite.prepare("SELECT COUNT(*) AS c FROM block_translations").get() as {
      c: number;
    }
  ).c;
  const hasOldTranslations = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='translations'"
    )
    .get();
  if (btCount === 0 && hasOldTranslations) {
    sqlite.exec(
      `INSERT OR IGNORE INTO block_translations (block_id, target_role, translated_md, status, created_at, attempt_at)
       SELECT block_id, target_role, translated_md, status, created_at, attempt_at FROM translations`
    );
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

function seed(sqlite: Database.Database) {
  const now = new Date().toISOString();

  // 기존 시드 계정 (username 로그인) — 하위 호환 유지
  const insertUser = sqlite.prepare(
    "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)"
  );
  insertUser.run("planner", hashPassword("demo1234"), "planner");
  insertUser.run("developer", hashPassword("demo1234"), "developer");
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO documents (id, title, created_at) VALUES (1, ?, ?)"
    )
    .run("샘플 프로젝트 문서", now);

  // 이메일 가입 데모 계정 (다중 사용자·동일 직군 협업 시연용)
  const insertAccount = sqlite.prepare(
    "INSERT OR IGNORE INTO users (username, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)"
  );
  const demoPw = hashPassword("demo1234");
  insertAccount.run("mina", "mina@team.co", "박미나", demoPw, "planner");
  insertAccount.run("jun", "jun@team.co", "Jun", demoPw, "developer");
  insertAccount.run("sora", "sora@team.co", "Sora", demoPw, "developer");
  const uid = (email: string): number =>
    (sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email) as
      | { id: number }
      | undefined)?.id ?? 0;
  const mina = uid("mina@team.co");
  const jun = uid("jun@team.co");
  const sora = uid("sora@team.co");

  // 데모 프로젝트는 projects가 비었을 때만 1회 시드 (멱등)
  const projectCount = (
    sqlite.prepare("SELECT COUNT(*) AS c FROM projects").get() as { c: number }
  ).c;
  if (projectCount === 0 && mina && jun && sora) {
    const newProject = (title: string, createdBy: number): number => {
      const r = sqlite
        .prepare(
          "INSERT INTO projects (title, type, link_shared, created_by, created_at) VALUES (?, 'project', 0, ?, ?)"
        )
        .run(title, createdBy, now);
      return Number(r.lastInsertRowid);
    };
    const addMember = (
      projectId: number,
      userId: number,
      role: string,
      perm: string
    ): void => {
      sqlite
        .prepare(
          "INSERT OR IGNORE INTO project_members (project_id, user_id, role, perm, created_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run(projectId, userId, role, perm, now);
    };
    const newProjectDoc = (projectId: number, title: string): void => {
      sqlite
        .prepare(
          "INSERT INTO documents (title, project_id, created_at) VALUES (?, ?, ?)"
        )
        .run(title, projectId, now);
    };

    // 프로젝트 1 — mina(소유자) + jun·sora, mina의 메인 문서
    const p1 = newProject("팝업스토어 오픈 프로젝트", mina);
    addMember(p1, mina, "planner", "owner");
    addMember(p1, jun, "developer", "editor");
    addMember(p1, sora, "designer", "editor");
    newProjectDoc(p1, "팝업스토어 오픈 프로젝트");

    // 프로젝트 2 — sora 소유, mina에게 보낸 대기 중 초대 (받은 초대 시연)
    const p2 = newProject("브랜드 캠페인 킥오프", sora);
    addMember(p2, sora, "designer", "owner");
    newProjectDoc(p2, "브랜드 캠페인 킥오프");
    sqlite
      .prepare(
        "INSERT INTO invites (project_id, email, role, perm, invited_by, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)"
      )
      .run(p2, "mina@team.co", "designer", "editor", sora, now);
  }

  // 백서 데모 콘텐츠 — section_content가 비었을 때만 첫 프로젝트 메인 문서에 1회 시드.
  // 백서 리더가 "일반 문서"처럼 보이도록 절별 산문을 채워둔다.
  const scCount = (
    sqlite.prepare("SELECT COUNT(*) AS c FROM section_content").get() as {
      c: number;
    }
  ).c;
  const firstProjectDoc = sqlite
    .prepare(
      `SELECT d.id FROM documents d JOIN projects p ON p.id = d.project_id
       ORDER BY p.id ASC, d.id ASC LIMIT 1`
    )
    .get() as { id: number } | undefined;
  if (scCount === 0 && firstProjectDoc) {
    const did = firstProjectDoc.id;
    const sc = sqlite.prepare(
      `INSERT INTO section_content (doc_id, section_key, sub_key, title, body_md, status, order_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const rows: [string, string, string, string, string, number][] = [
      ["why", "why.goal", "프로젝트 목적", "팝업스토어를 통해 신규 고객에게 브랜드를 직접 경험시키고, 오프라인 방문을 온라인 멤버십 가입으로 연결한다. 2주 운영 기간 동안 방문자 경험과 가입 전환을 함께 끌어올리는 것을 목표로 한다.", "agreed", 0],
      ["why", "why.target", "지향점", "‘구경하고 끝나는 팝업’이 아니라, 다녀간 사람이 자연스럽게 멤버십으로 이어지는 흐름을 만든다. 모든 결정은 이 전환 흐름을 해치지 않는 선에서 내린다.", "agreed", 1],
      ["what", "what.deliverable", "핵심 결과물", "현장 체험 존, QR 기반 멤버십 가입 플로우, 운영 대시보드 세 가지를 결과물로 한다. 각 결과물은 오픈 전 리허설에서 한 번씩 점검한다.", "agreed", 0],
      ["what", "what.tasks", "세부 과업", "체험 존 동선 설계, 가입 폼 간소화(필수 입력 최소화), 방문·가입 집계 대시보드 구성을 포함한다. 집계 항목의 상세 정의는 논의 중이다.", "discussing", 1],
      ["how", "how.method", "수행 방식과 제약", "기획·디자인·개발이 매일 짧게 동기화하고, 현장 변경은 당일 합의로 반영한다. 외부 결제 연동은 이번 범위에서 제외한다.", "discussing", 0],
    ];
    for (const [section, sub, title, body, status, order] of rows) {
      sc.run(did, section, sub, title, body, status, order, now);
    }
    // rules 절은 의도적으로 비워 "작성 전" 플레이스홀더를 시연한다.
  }
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
