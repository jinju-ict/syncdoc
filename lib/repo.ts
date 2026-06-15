/**
 * 데이터 접근 계층 (단일 진입점) — 모든 불변식은 여기서 강제된다.
 *
 * 불변식 (계획 §핵심 불변식):
 * 1. draft 가시성: draft 블록은 작성자 본인에게만 반환된다.
 *    타임라인 조회(getTimeline)는 locked 블록만 반환한다.
 * 2. 잠긴 블록 수정 경로 부재: updateDraft는 `status='draft' AND author_id=?`
 *    조건부 UPDATE만 제공한다. (DB 트리거가 2중 방어)
 * 3. '보내기' = 단일 동기 트랜잭션 4단계 (잠금 → pending 번역 선삽입 →
 *    승인 해제 → 커밋). 번역 API 호출은 트랜잭션 밖(호출부 책임).
 * 4. 번역 결과 기록은 조건부 UPDATE(WHERE status='pending') — 재시도 경합 무해화.
 * 5. 댓글은 locked 블록 전용.
 */

import { createHash } from "node:crypto";
import { sqlite } from "./db";
import { toCoreRole } from "./schema";
import { CONTENT_SECTIONS, sectionLabel } from "./sections";
import type { SectionKey } from "./sections";
import type {
  AttachmentKind,
  DocKind,
  DocumentStatus,
  ExpertiseLevel,
  InviteStatus,
  JoinRequestStatus,
  Lang,
  Permission,
  ProjectRole,
  Role,
  TranslationStatus,
} from "./schema";

export type {
  AttachmentKind,
  DocKind,
  DocumentStatus,
  ExpertiseLevel,
  InviteStatus,
  JoinRequestStatus,
  Lang,
  Permission,
  ProjectRole,
  Role,
  BlockStatus,
  TranslationStatus,
} from "./schema";

// ---------------------------------------------------------------------------
// 타입 (page.tsx → 컴포넌트 props로 그대로 전달되는 형태)
// ---------------------------------------------------------------------------

export type UserRow = {
  id: number;
  username: string;
  email: string | null;
  name: string | null;
  passwordHash: string;
  role: Role;
  level: ExpertiseLevel;
  lang: Lang;
};

/** 계정 표시 정보 (시작 셸 세션 표시용) */
export type AccountInfo = {
  id: number;
  username: string;
  email: string | null;
  name: string;
  role: Role;
};

/** 홈 프로젝트 카드 한 줄 */
export type ProjectSummary = {
  id: number;
  title: string;
  type: string;
  myRole: ProjectRole;
  myPerm: Permission;
  memberCount: number;
};

export type MemberInfo = {
  userId: number;
  name: string;
  email: string;
  role: ProjectRole;
  perm: Permission;
};

/** 프로젝트 상세 (멤버·링크 공유·메인 문서) */
export type ProjectDetail = {
  id: number;
  title: string;
  type: string;
  linkShared: boolean;
  myRole: ProjectRole;
  myPerm: Permission;
  mainDocId: number | null;
  members: MemberInfo[];
};

/** 받은 초대 한 줄 */
export type InviteInfo = {
  id: number;
  projectId: number;
  title: string;
  from: string;
  role: ProjectRole;
  perm: Permission;
};

export type DocumentInfo = {
  id: number;
  title: string;
  approvalPlannerAt: string | null;
  approvalDeveloperAt: string | null;
  status: DocumentStatus;
  archivedAt: string | null;
  createdAt: string | null;
};

/** 홈 문서 목록 한 줄 — 목록 화면이 필요로 하는 요약 정보 */
export type DocumentListItem = DocumentInfo & {
  blockCount: number;
  lastLockedAt: string | null;
};

export type TranslationInfo = {
  blockId: number;
  targetRole: ProjectRole;
  translatedMd: string | null;
  status: TranslationStatus;
  createdAt: string;
  attemptAt: string | null;
};

export type CommentInfo = {
  id: number;
  blockId: number;
  authorId: number;
  authorUsername: string;
  authorRole: Role;
  body: string;
  parentId: number | null;
  createdAt: string;
};

/** 타임라인의 잠긴 블록 + 번역 + 댓글 (BlockView/CommentSidebar의 단위 데이터) */
export type TimelineBlock = {
  id: number;
  docId: number;
  authorId: number;
  authorRole: ProjectRole;
  sourceMd: string;
  status: "locked";
  lockedAt: string;
  versionTag: string;
  seq: number;
  sectionKey: SectionKey | null;
  translation: TranslationInfo | null;
  comments: CommentInfo[];
};

export type DraftBlock = {
  id: number;
  docId: number;
  authorId: number;
  authorRole: ProjectRole;
  sourceMd: string;
  sectionKey: SectionKey | null;
  status: "draft";
};

export type AbstractInfo = {
  id: number;
  docId: number;
  abstractMd: string;
  tocMd: string;
  generatedAt: string;
};

/** sendBlock 결과 — 호출부가 트랜잭션 밖에서 직군별 translate()를 호출할 때 필요 */
export type SentBlock = {
  blockId: number;
  docId: number;
  sourceMd: string;
  authorRole: ProjectRole;
};

/** 단일 (블록, 대상직군, 언어) 번역 작업 — enqueue/retry가 반환 */
export type TranslationJob = {
  blockId: number;
  docId: number;
  sourceMd: string;
  targetRole: ProjectRole;
  targetLang: Lang;
};

const STALE_PENDING_MS = 2 * 60 * 1000; // 2분 초과 pending은 재시도 허용

const now = () => new Date().toISOString();

function dateStamp(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const roleLabel: Record<Role, string> = {
  planner: "기획팀",
  developer: "개발팀",
};

/** 버전 태그·표시용 4직군 라벨 */
const projectRoleLabel: Record<ProjectRole, string> = {
  planner: "기획팀",
  developer: "개발팀",
  designer: "디자인팀",
  ops: "운영팀",
};

export const oppositeRole = (role: Role): Role =>
  role === "planner" ? "developer" : "planner";

// ---------------------------------------------------------------------------
// 사용자
// ---------------------------------------------------------------------------

const USER_COLS =
  "id, username, email, name, password_hash AS passwordHash, role, level, lang";

export function getUserByUsername(username: string): UserRow | null {
  const row = sqlite
    .prepare(`SELECT ${USER_COLS} FROM users WHERE username = ?`)
    .get(username) as UserRow | undefined;
  return row ?? null;
}

export function getUserByEmail(email: string): UserRow | null {
  const row = sqlite
    .prepare(`SELECT ${USER_COLS} FROM users WHERE email = ?`)
    .get(email.trim().toLowerCase()) as UserRow | undefined;
  return row ?? null;
}

export function getUserById(id: number): UserRow | null {
  const row = sqlite
    .prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`)
    .get(id) as UserRow | undefined;
  return row ?? null;
}

/** 계정 표시명 — name이 있으면 name, 없으면 username */
export function accountDisplayName(u: UserRow): string {
  return (u.name && u.name.trim()) || u.username;
}

const VALID_LANGS: readonly Lang[] = ["ko", "en", "ja"];
export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (VALID_LANGS as readonly string[]).includes(v);
}

export function getUserLang(userId: number): Lang {
  const row = sqlite
    .prepare("SELECT lang FROM users WHERE id = ?")
    .get(userId) as { lang: Lang } | undefined;
  return row?.lang ?? "ko";
}

export function setUserLang(userId: number, lang: Lang): boolean {
  if (!isLang(lang)) return false;
  const r = sqlite
    .prepare("UPDATE users SET lang = ? WHERE id = ?")
    .run(lang, userId);
  return r.changes > 0;
}

/**
 * 이메일 가입 — username은 이메일 로컬파트 기준으로 충돌 없이 생성한다.
 * 전역 role은 멤버십이 없을 때의 폴백일 뿐이라 'planner'로 둔다.
 * 이미 같은 이메일이 있으면 null (호출부가 "이미 가입된 이메일" 처리).
 */
export function createAccount(args: {
  name: string;
  email: string;
  passwordHash: string;
}): UserRow | null {
  const email = args.email.trim().toLowerCase();
  if (getUserByEmail(email)) return null;

  const base = (email.split("@")[0] || "user").replace(/[^a-zA-Z0-9_.-]/g, "");
  let username = base || "user";
  let n = 1;
  while (
    sqlite.prepare("SELECT 1 FROM users WHERE username = ?").get(username)
  ) {
    username = `${base}-${n++}`;
  }

  const result = sqlite
    .prepare(
      "INSERT INTO users (username, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'planner')"
    )
    .run(username, email, args.name.trim() || base, args.passwordHash);
  return getUserById(Number(result.lastInsertRowid));
}

const LEVELS: readonly ExpertiseLevel[] = [
  "beginner",
  "intermediate",
  "expert",
] as const;

export function isExpertiseLevel(v: unknown): v is ExpertiseLevel {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}

export function getUserLevel(userId: number): ExpertiseLevel {
  const row = sqlite
    .prepare("SELECT level FROM users WHERE id = ?")
    .get(userId) as { level: ExpertiseLevel } | undefined;
  return row?.level ?? "intermediate";
}

export function setUserLevel(userId: number, level: ExpertiseLevel): boolean {
  if (!isExpertiseLevel(level)) return false;
  const result = sqlite
    .prepare("UPDATE users SET level = ? WHERE id = ?")
    .run(level, userId);
  return result.changes > 0;
}

/**
 * 번역 독자의 레벨 — targetRole 사용자의 현재 레벨을 번역 호출 시점에 조회한다.
 * (MVP: 역할당 사용자 1명. 다중 사용자가 되면 레벨별 번역 저장으로 확장 필요)
 */
export function getLevelForRole(role: Role): ExpertiseLevel {
  const row = sqlite
    .prepare("SELECT level FROM users WHERE role = ? ORDER BY id ASC LIMIT 1")
    .get(role) as { level: ExpertiseLevel } | undefined;
  return row?.level ?? "intermediate";
}

// ---------------------------------------------------------------------------
// 문서
// ---------------------------------------------------------------------------

export function getDocument(docId: number): DocumentInfo | null {
  const row = sqlite
    .prepare(
      `SELECT id, title,
              approval_planner_at AS approvalPlannerAt,
              approval_developer_at AS approvalDeveloperAt,
              status, archived_at AS archivedAt, created_at AS createdAt
       FROM documents WHERE id = ?`
    )
    .get(docId) as DocumentInfo | undefined;
  return row ?? null;
}

/** 쓰기 경로 공용 가드 — 보관 문서에는 어떤 변경도 허용하지 않는다 (DB 트리거가 2중 방어) */
function assertDocActive(docId: number): void {
  const row = sqlite
    .prepare("SELECT status FROM documents WHERE id = ?")
    .get(docId) as { status: DocumentStatus } | undefined;
  if (!row) throw new Error("문서를 찾을 수 없습니다.");
  if (row.status !== "active")
    throw new Error("보관된 문서는 읽기 전용입니다.");
}

/** 홈 목록 — 진행 중/보관 전체. 블록 수와 마지막 확정 시각 포함 */
export function listDocuments(): DocumentListItem[] {
  return sqlite
    .prepare(
      `SELECT d.id, d.title,
              d.approval_planner_at AS approvalPlannerAt,
              d.approval_developer_at AS approvalDeveloperAt,
              d.status, d.archived_at AS archivedAt, d.created_at AS createdAt,
              COUNT(b.id) AS blockCount,
              MAX(b.locked_at) AS lastLockedAt
       FROM documents d
       LEFT JOIN blocks b ON b.doc_id = d.id AND b.status = 'locked'
       GROUP BY d.id
       ORDER BY d.status ASC, COALESCE(MAX(b.locked_at), d.created_at, '') DESC, d.id DESC`
    )
    .all() as DocumentListItem[];
}

export function createDocument(title: string): number {
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new Error("문서 제목을 입력하세요.");
  const result = sqlite
    .prepare("INSERT INTO documents (title, created_at) VALUES (?, ?)")
    .run(trimmed, now());
  return Number(result.lastInsertRowid);
}

/**
 * 보관/해제 — 상태 전환만 한다. 블록·번역·댓글·Abstract는 그대로 보존되므로
 * 내용 추적이 항상 가능하다. 삭제 경로는 제공하지 않는다.
 */
export function setDocumentArchived(docId: number, archived: boolean): boolean {
  const result = archived
    ? sqlite
        .prepare(
          "UPDATE documents SET status = 'archived', archived_at = ? WHERE id = ? AND status = 'active'"
        )
        .run(now(), docId)
    : sqlite
        .prepare(
          "UPDATE documents SET status = 'active', archived_at = NULL WHERE id = ? AND status = 'archived'"
        )
        .run(docId);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// 타임라인 (locked 블록만 — draft는 절대 포함되지 않음)
// ---------------------------------------------------------------------------

/**
 * 타임라인 — 잠긴 블록 + (뷰어 직군용) 번역 + 댓글.
 * 번역은 block_translations에서 target_role = viewerRole 행만 가져온다.
 * 본인 직군 블록은 BlockView가 원문을 보여주므로 번역이 없어도 무방.
 */
export function getTimeline(
  docId: number,
  viewerRole: ProjectRole,
  viewerLang: Lang = "ko",
  sectionKey?: SectionKey
): TimelineBlock[] {
  const blocks = sqlite
    .prepare(
      `SELECT id, doc_id AS docId, author_id AS authorId,
              COALESCE(author_project_role, author_role) AS authorRole,
              source_md AS sourceMd, status, locked_at AS lockedAt,
              version_tag AS versionTag, seq, section_key AS sectionKey
       FROM blocks
       WHERE doc_id = @docId AND status = 'locked'
         ${sectionKey ? "AND section_key = @sec" : ""}
       ORDER BY seq ASC`
    )
    .all(sectionKey ? { docId, sec: sectionKey } : { docId }) as Omit<
    TimelineBlock,
    "translation" | "comments"
  >[];

  if (blocks.length === 0) return [];

  const translations = sqlite
    .prepare(
      `SELECT t.block_id AS blockId, t.target_role AS targetRole,
              t.translated_md AS translatedMd, t.status,
              t.created_at AS createdAt, t.attempt_at AS attemptAt
       FROM block_translations t
       JOIN blocks b ON b.id = t.block_id
       WHERE b.doc_id = ? AND t.target_role = ? AND t.target_lang = ?`
    )
    .all(docId, viewerRole, viewerLang) as TranslationInfo[];
  const translationByBlock = new Map(translations.map((t) => [t.blockId, t]));

  const comments = sqlite
    .prepare(
      `SELECT c.id, c.block_id AS blockId, c.author_id AS authorId,
              u.username AS authorUsername, u.role AS authorRole,
              c.body, c.parent_id AS parentId, c.created_at AS createdAt
       FROM comments c
       JOIN users u ON u.id = c.author_id
       JOIN blocks b ON b.id = c.block_id
       WHERE b.doc_id = ?
       ORDER BY c.created_at ASC, c.id ASC`
    )
    .all(docId) as CommentInfo[];

  return blocks.map((b) => ({
    ...b,
    translation: translationByBlock.get(b.id) ?? null,
    comments: comments.filter((c) => c.blockId === b.id),
  }));
}

// ---------------------------------------------------------------------------
// 초안 (draft) — 작성자 본인 전용
// ---------------------------------------------------------------------------

/** 작성자 본인의 draft만 반환 (draft 가시성 규칙의 구현 지점) */
/** 작성자 본인의 draft — 절(sectionKey)별로 구분. NULL = 전체/대화 렌즈 초안 */
export function getOwnDraft(
  docId: number,
  authorId: number,
  sectionKey: SectionKey | null = null
): DraftBlock | null {
  const row = sqlite
    .prepare(
      `SELECT id, doc_id AS docId, author_id AS authorId,
              COALESCE(author_project_role, author_role) AS authorRole,
              source_md AS sourceMd, section_key AS sectionKey, status
       FROM blocks
       WHERE doc_id = @docId AND author_id = @authorId AND status = 'draft'
         AND ${sectionKey === null ? "section_key IS NULL" : "section_key = @sec"}
       ORDER BY id DESC LIMIT 1`
    )
    .get(
      sectionKey === null
        ? { docId, authorId }
        : { docId, authorId, sec: sectionKey }
    ) as DraftBlock | undefined;
  return row ?? null;
}

/**
 * 초안 저장(upsert): 기존 draft가 있으면 조건부 UPDATE, 없으면 INSERT. blockId 반환.
 * author.role은 4직군 — author_role에는 2축 매핑값(CHECK 제약), author_project_role에는
 * 4직군 원본을 함께 기록한다.
 */
export function saveDraft(
  docId: number,
  author: { id: number; role: ProjectRole },
  md: string,
  sectionKey: SectionKey | null = null
): number {
  assertDocActive(docId);
  const existing = getOwnDraft(docId, author.id, sectionKey);
  if (existing) {
    updateDraft(existing.id, author.id, md);
    return existing.id;
  }
  const result = sqlite
    .prepare(
      `INSERT INTO blocks (doc_id, author_id, author_role, author_project_role, source_md, section_key, status)
       VALUES (?, ?, ?, ?, ?, ?, 'draft')`
    )
    .run(docId, author.id, toCoreRole(author.role), author.role, md, sectionKey);
  return Number(result.lastInsertRowid);
}

/** 조건부 UPDATE — 잠긴 블록 수정 경로는 코드에 존재하지 않는다 */
export function updateDraft(blockId: number, authorId: number, md: string): boolean {
  const result = sqlite
    .prepare(
      `UPDATE blocks SET source_md = ?
       WHERE id = ? AND status = 'draft' AND author_id = ?`
    )
    .run(md, blockId, authorId);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// '보내기' — 단일 동기 트랜잭션 4단계
// ---------------------------------------------------------------------------

/**
 * (a) 블록 잠금  (b) 상대 역할 pending 번역 선삽입
 * (c) 문서 승인 2컬럼 NULL 해제  (d) 커밋
 * 번역 API 호출은 이 함수 밖에서 (actions.ts가 결과를 recordTranslation으로 기록).
 */
export function sendBlock(blockId: number, authorId: number): SentBlock {
  const tx = sqlite.transaction((): SentBlock => {
    const block = sqlite
      .prepare(
        `SELECT id, doc_id AS docId,
                COALESCE(author_project_role, author_role) AS authorRole,
                source_md AS sourceMd
         FROM blocks
         WHERE id = ? AND author_id = ? AND status = 'draft'`
      )
      .get(blockId, authorId) as
      | { id: number; docId: number; authorRole: ProjectRole; sourceMd: string }
      | undefined;
    if (!block) throw new Error("보낼 수 있는 초안이 없습니다.");
    if (block.sourceMd.trim().length === 0)
      throw new Error("빈 초안은 보낼 수 없습니다.");
    assertDocActive(block.docId);

    const maxSeq = sqlite
      .prepare(
        `SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM blocks
         WHERE doc_id = ? AND status = 'locked'`
      )
      .get(block.docId) as { maxSeq: number };
    const seq = maxSeq.maxSeq + 1;
    const lockedAt = now();
    const versionTag = `[${dateStamp()} v${seq} - ${projectRoleLabel[block.authorRole]}]`;

    // (a) 잠금 — WHERE status='draft' 조건으로 트리거와 충돌 없음
    const locked = sqlite
      .prepare(
        `UPDATE blocks SET status = 'locked', locked_at = ?, version_tag = ?, seq = ?
         WHERE id = ? AND status = 'draft'`
      )
      .run(lockedAt, versionTag, seq, blockId);
    if (locked.changes !== 1) throw new Error("블록 잠금에 실패했습니다.");

    // (b) 새 블록 확정 → 양측 승인 해제 + 멤버 서명 비움 (반드시 트랜잭션 내부)
    //     번역(block_translations)은 트랜잭션 밖에서 직군별로 enqueue/생성된다.
    sqlite
      .prepare(
        `UPDATE documents SET approval_planner_at = NULL, approval_developer_at = NULL
         WHERE id = ?`
      )
      .run(block.docId);
    sqlite.prepare("DELETE FROM signatures WHERE doc_id = ?").run(block.docId);

    return {
      blockId,
      docId: block.docId,
      sourceMd: block.sourceMd,
      authorRole: block.authorRole,
    };
  });
  return tx(); // (d) 커밋
}

// ---------------------------------------------------------------------------
// 번역 결과 기록 / 재시도
// ---------------------------------------------------------------------------

/** (블록, 직군, 언어) pending 행을 선삽입 — 이미 있으면 무시. 번역 생성 시작점 */
export function enqueueTranslation(
  blockId: number,
  targetRole: ProjectRole,
  targetLang: Lang = "ko"
): void {
  const ts = now();
  sqlite
    .prepare(
      `INSERT INTO block_translations (block_id, target_role, target_lang, status, created_at, attempt_at)
       VALUES (?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(block_id, target_role, target_lang) DO NOTHING`
    )
    .run(blockId, targetRole, targetLang, ts, ts);
}

/** 조건부 UPDATE(WHERE status='pending') — 비행 중 호출과 재시도의 경합 무해화 */
export function recordTranslation(
  blockId: number,
  targetRole: ProjectRole,
  targetLang: Lang,
  result: { ok: true; md: string } | { ok: false; error: string }
): boolean {
  const updated = result.ok
    ? sqlite
        .prepare(
          `UPDATE block_translations SET status = 'ok', translated_md = ?
           WHERE block_id = ? AND target_role = ? AND target_lang = ? AND status = 'pending'`
        )
        .run(result.md, blockId, targetRole, targetLang)
    : sqlite
        .prepare(
          `UPDATE block_translations SET status = 'failed'
           WHERE block_id = ? AND target_role = ? AND target_lang = ? AND status = 'pending'`
        )
        .run(blockId, targetRole, targetLang);
  return updated.changes > 0;
}

// ---------------------------------------------------------------------------
// 번역 캐시 (translation_cache) — 메시지 내용 해시 × 직군 × 언어 × 숙련도.
// 같은 문장 반복 시 AI 재호출 없이 재사용 (토큰·지연 절약). 의미가 보존되는
// '정확 일치(정규화)' 캐시 — 비슷하지만 다른 문장에 잘못 물리지 않는다.
// ---------------------------------------------------------------------------

/** 캐시 키 정규화: 앞뒤 공백 제거 + 연속 공백/개행을 단일 공백으로 축약 후 해시 */
function translationContentHash(sourceMd: string): string {
  const normalized = sourceMd.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

/** 캐시 조회 — 동일 (정규화 내용, 직군, 언어, 수준) 번역이 있으면 반환 */
export function getCachedTranslation(
  sourceMd: string,
  targetRole: ProjectRole,
  targetLang: Lang,
  level: ExpertiseLevel
): string | null {
  const row = sqlite
    .prepare(
      `SELECT translated_md AS md FROM translation_cache
       WHERE source_hash = ? AND target_role = ? AND target_lang = ? AND level = ?`
    )
    .get(translationContentHash(sourceMd), targetRole, targetLang, level) as
    | { md: string }
    | undefined;
  return row?.md ?? null;
}

/** 캐시 저장 (멱등 — 이미 있으면 무시) */
export function putCachedTranslation(
  sourceMd: string,
  targetRole: ProjectRole,
  targetLang: Lang,
  level: ExpertiseLevel,
  translatedMd: string
): void {
  sqlite
    .prepare(
      `INSERT INTO translation_cache (source_hash, target_role, target_lang, level, translated_md, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_hash, target_role, target_lang, level) DO NOTHING`
    )
    .run(
      translationContentHash(sourceMd),
      targetRole,
      targetLang,
      level,
      translatedMd,
      now()
    );
}

/** 최근 메시지(잠긴 블록) — 추천 메시지 생성의 대화 맥락용. 시간순(오래된→최신). */
export type RecentMessage = { authorRole: ProjectRole; sourceMd: string };
export function getRecentMessages(
  docId: number,
  limit: number = 12
): RecentMessage[] {
  const rows = sqlite
    .prepare(
      `SELECT COALESCE(author_project_role, author_role) AS authorRole, source_md AS sourceMd
       FROM blocks WHERE doc_id = ? AND status = 'locked'
       ORDER BY locked_at DESC, seq DESC LIMIT ?`
    )
    .all(docId, limit) as RecentMessage[];
  return rows.reverse();
}

/**
 * 재시도 준비: (블록, 직군, 언어) 행이 없으면 새로 만들고, 있으면 failed 또는
 * 오래된 pending(2분 초과)만 pending으로 되돌린다. 진행이 허용되면 작업 정보 반환.
 */
export function markTranslationRetry(
  blockId: number,
  targetRole: ProjectRole,
  targetLang: Lang = "ko"
): TranslationJob | null {
  const existing = sqlite
    .prepare(
      "SELECT status, attempt_at AS attemptAt FROM block_translations WHERE block_id = ? AND target_role = ? AND target_lang = ?"
    )
    .get(blockId, targetRole, targetLang) as
    | { status: TranslationStatus; attemptAt: string | null }
    | undefined;

  if (!existing) {
    enqueueTranslation(blockId, targetRole, targetLang);
  } else {
    const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
    const result = sqlite
      .prepare(
        `UPDATE block_translations SET status = 'pending', attempt_at = ?
         WHERE block_id = ? AND target_role = ? AND target_lang = ?
           AND (status = 'failed'
                OR (status = 'pending' AND (attempt_at IS NULL OR attempt_at < ?)))`
      )
      .run(now(), blockId, targetRole, targetLang, staleBefore);
    if (result.changes === 0) return null;
  }

  const row = sqlite
    .prepare(
      `SELECT id AS blockId, doc_id AS docId, source_md AS sourceMd
       FROM blocks WHERE id = ?`
    )
    .get(blockId) as
    | { blockId: number; docId: number; sourceMd: string }
    | undefined;
  return row ? { ...row, targetRole, targetLang } : null;
}

/**
 * 뷰어(직군 R, 언어 L)가 이 문서에서 필요한 블록 번역 작업 목록.
 * (작성자 직군 == R AND L == 'ko')이면 원문이므로 제외. 이미 ok/pending이면 제외.
 * pending 행을 선삽입하고 생성해야 할 작업을 반환한다(호출부가 after()로 생성).
 */
export function ensureBlockTranslations(
  docId: number,
  viewerRole: ProjectRole,
  viewerLang: Lang
): TranslationJob[] {
  const blocks = sqlite
    .prepare(
      `SELECT id, source_md AS sourceMd,
              COALESCE(author_project_role, author_role) AS authorRole
       FROM blocks WHERE doc_id = ? AND status = 'locked'`
    )
    .all(docId) as { id: number; sourceMd: string; authorRole: ProjectRole }[];

  const jobs: TranslationJob[] = [];
  for (const b of blocks) {
    if (b.authorRole === viewerRole && viewerLang === "ko") continue; // 원문
    const existing = sqlite
      .prepare(
        "SELECT status FROM block_translations WHERE block_id = ? AND target_role = ? AND target_lang = ?"
      )
      .get(b.id, viewerRole, viewerLang) as
      | { status: TranslationStatus }
      | undefined;
    // 렌더 시 호출돼도 안전하도록 행이 아예 없을 때만 생성한다(실패는 재시도 버튼이 처리).
    if (existing) continue;
    enqueueTranslation(b.id, viewerRole, viewerLang);
    jobs.push({ blockId: b.id, docId, sourceMd: b.sourceMd, targetRole: viewerRole, targetLang: viewerLang });
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// 댓글 — locked 블록 전용
// ---------------------------------------------------------------------------

export function addComment(
  blockId: number,
  authorId: number,
  body: string,
  parentId: number | null = null
): number {
  const block = sqlite
    .prepare("SELECT status, doc_id AS docId FROM blocks WHERE id = ?")
    .get(blockId) as { status: string; docId: number } | undefined;
  if (!block) throw new Error("블록을 찾을 수 없습니다.");
  if (block.status !== "locked")
    throw new Error("댓글은 잠긴 블록에만 작성할 수 있습니다.");
  assertDocActive(block.docId);
  if (body.trim().length === 0) throw new Error("댓글 내용을 입력하세요.");

  const result = sqlite
    .prepare(
      `INSERT INTO comments (block_id, author_id, body, parent_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(blockId, authorId, body, parentId, now());
  return Number(result.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Abstract (다행 히스토리 — 최신 행이 표지)
// ---------------------------------------------------------------------------

export function getLatestAbstract(docId: number): AbstractInfo | null {
  const row = sqlite
    .prepare(
      `SELECT id, doc_id AS docId, abstract_md AS abstractMd,
              toc_md AS tocMd, generated_at AS generatedAt
       FROM abstracts WHERE doc_id = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(docId) as AbstractInfo | undefined;
  return row ?? null;
}

export function addAbstract(
  docId: number,
  abstractMd: string,
  tocMd: string
): number {
  const result = sqlite
    .prepare(
      `INSERT INTO abstracts (doc_id, abstract_md, toc_md, generated_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(docId, abstractMd, tocMd, now());
  return Number(result.lastInsertRowid);
}

/** 역할별 승인 기록 (양측 승인 완료 여부 반환) — Wave3에서 사용 */
export function setApproval(docId: number, role: Role): boolean {
  assertDocActive(docId);
  const column =
    role === "planner" ? "approval_planner_at" : "approval_developer_at";
  sqlite
    .prepare(`UPDATE documents SET ${column} = ? WHERE id = ?`)
    .run(now(), docId);
  const doc = getDocument(docId);
  return Boolean(doc?.approvalPlannerAt && doc?.approvalDeveloperAt);
}

/** abstract() 입력용 — 잠긴 블록의 원문·작성 직군·버전 태그만 시간순으로 */
export function getLockedBlocksForAbstract(
  docId: number
): { sourceMd: string; authorRole: ProjectRole; versionTag: string | null }[] {
  return sqlite
    .prepare(
      `SELECT source_md AS sourceMd,
              COALESCE(author_project_role, author_role) AS authorRole,
              version_tag AS versionTag
       FROM blocks
       WHERE doc_id = ? AND status = 'locked'
       ORDER BY seq ASC`
    )
    .all(docId) as {
    sourceMd: string;
    authorRole: ProjectRole;
    versionTag: string | null;
  }[];
}

/**
 * 조건부 INSERT — sinceTs(최종 승인 시각, ISO) 이후 생성된 abstracts 행이 아직
 * 없을 때만 새 히스토리 행을 추가한다 (양측 동시 재시도 경합 시 중복 행 무해화).
 * 추가되면 새 행 id, 이미 있으면 null 반환. 기존 행은 절대 수정하지 않는다
 * (다행 히스토리 — append-only).
 */
export function addAbstractIfMissingSince(
  docId: number,
  sinceTs: string,
  abstractMd: string,
  tocMd: string
): number | null {
  const result = sqlite
    .prepare(
      `INSERT INTO abstracts (doc_id, abstract_md, toc_md, generated_at)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM abstracts WHERE doc_id = ? AND generated_at >= ?
       )`
    )
    .run(docId, abstractMd, tocMd, now(), docId, sinceTs);
  return result.changes > 0 ? Number(result.lastInsertRowid) : null;
}

// ---------------------------------------------------------------------------
// 프로젝트 / 멤버십 / 초대 (시작 셸 — 온보딩·협업 단위)
// ---------------------------------------------------------------------------

/**
 * 프로젝트 생성 — 소유자 멤버십 + 메인 문서를 한 트랜잭션으로 만든다.
 * 디자인 결정: 타입은 'project' 고정(회의록·릴리스는 그 안의 산물).
 */
export function createProject(args: {
  title: string;
  ownerId: number;
  ownerRole: ProjectRole;
}): { projectId: number; docId: number } {
  const title = args.title.trim() || "제목 없는 프로젝트";
  const tx = sqlite.transaction(() => {
    const ts = now();
    const pr = sqlite
      .prepare(
        "INSERT INTO projects (title, type, link_shared, created_by, created_at) VALUES (?, 'project', 0, ?, ?)"
      )
      .run(title, args.ownerId, ts);
    const projectId = Number(pr.lastInsertRowid);
    sqlite
      .prepare(
        "INSERT INTO project_members (project_id, user_id, role, perm, created_at) VALUES (?, ?, ?, 'owner', ?)"
      )
      .run(projectId, args.ownerId, args.ownerRole, ts);
    const dr = sqlite
      .prepare(
        "INSERT INTO documents (title, project_id, created_at) VALUES (?, ?, ?)"
      )
      .run(title, projectId, ts);
    return { projectId, docId: Number(dr.lastInsertRowid) };
  });
  return tx();
}

/** 사용자가 속한 프로젝트 목록 (홈 카드용) — 멤버십 직군·권한·멤버 수 포함 */
export function listProjectsForUser(userId: number): ProjectSummary[] {
  return sqlite
    .prepare(
      `SELECT p.id, p.title, p.type,
              me.role AS myRole, me.perm AS myPerm,
              (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS memberCount
       FROM projects p
       JOIN project_members me ON me.project_id = p.id AND me.user_id = ?
       ORDER BY p.created_at DESC, p.id DESC`
    )
    .all(userId) as ProjectSummary[];
}

export function getProjectMainDocId(projectId: number): number | null {
  const row = sqlite
    .prepare(
      "SELECT id FROM documents WHERE project_id = ? ORDER BY id ASC LIMIT 1"
    )
    .get(projectId) as { id: number } | undefined;
  return row?.id ?? null;
}

export function getMembership(
  projectId: number,
  userId: number
): { role: ProjectRole; perm: Permission } | null {
  const row = sqlite
    .prepare(
      "SELECT role, perm FROM project_members WHERE project_id = ? AND user_id = ?"
    )
    .get(projectId, userId) as
    | { role: ProjectRole; perm: Permission }
    | undefined;
  return row ?? null;
}

/** 프로젝트 상세 — 멤버 본인이 아닌 경우 null (가시성 가드) */
export function getProjectForUser(
  projectId: number,
  userId: number
): ProjectDetail | null {
  const me = getMembership(projectId, userId);
  if (!me) return null;
  const proj = sqlite
    .prepare(
      "SELECT id, title, type, link_shared AS linkShared FROM projects WHERE id = ?"
    )
    .get(projectId) as
    | { id: number; title: string; type: string; linkShared: number }
    | undefined;
  if (!proj) return null;

  return {
    id: proj.id,
    title: proj.title,
    type: proj.type,
    linkShared: proj.linkShared === 1,
    myRole: me.role,
    myPerm: me.perm,
    mainDocId: getProjectMainDocId(projectId),
    members: listProjectMembers(projectId),
  };
}

/** 프로젝트 전체 멤버 (가시성 가드 없음) — 합의 계산 등 내부용 */
export function listProjectMembers(projectId: number): MemberInfo[] {
  return sqlite
    .prepare(
      `SELECT pm.user_id AS userId,
              COALESCE(NULLIF(TRIM(u.name), ''), u.username) AS name,
              COALESCE(u.email, '') AS email,
              pm.role, pm.perm
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?
       ORDER BY pm.id ASC`
    )
    .all(projectId) as MemberInfo[];
}

/**
 * 문서 합의 상태 — 참여자(소유자·편집자 멤버) 전원이 서명하면 agreed.
 * 프로젝트가 없는 레거시 문서는 기존 2축 승인(approval_*_at)으로 폴백한다.
 */
export type ConsensusParticipant = {
  userId: number;
  name: string;
  role: ProjectRole;
  signedAt: string | null;
};
export type DocConsensus = {
  participants: ConsensusParticipant[];
  agreed: boolean;
  latestSignedAt: string | null;
  legacy: boolean;
};
export function getDocConsensus(docId: number): DocConsensus {
  const sigs = listSignatures(docId);
  const sigByUser = new Map(sigs.map((s) => [s.userId, s.signedAt]));
  const latestSignedAt = sigs.length
    ? sigs.reduce((m, s) => (s.signedAt > m ? s.signedAt : m), sigs[0].signedAt)
    : null;

  const projectId = getProjectIdForDoc(docId);
  if (projectId != null) {
    const participants: ConsensusParticipant[] = listProjectMembers(projectId)
      .filter((m) => m.perm === "owner" || m.perm === "editor")
      .map((m) => ({
        userId: m.userId,
        name: m.name,
        role: m.role,
        signedAt: sigByUser.get(m.userId) ?? null,
      }));
    const agreed =
      participants.length > 0 && participants.every((p) => p.signedAt !== null);
    return { participants, agreed, latestSignedAt, legacy: false };
  }

  // 레거시: 2축 승인 컬럼
  const doc = getDocument(docId);
  const agreed = Boolean(doc?.approvalPlannerAt && doc?.approvalDeveloperAt);
  const legacyLatest =
    agreed && doc
      ? doc.approvalPlannerAt! > doc.approvalDeveloperAt!
        ? doc.approvalPlannerAt!
        : doc.approvalDeveloperAt!
      : null;
  return { participants: [], agreed, latestSignedAt: legacyLatest, legacy: true };
}

/** 권한 가드 — 소유자만 멤버 관리·링크 공유를 바꿀 수 있다 */
export function isProjectOwner(projectId: number, userId: number): boolean {
  return getMembership(projectId, userId)?.perm === "owner";
}

/** 프로젝트 소유자 수 (마지막 소유자 보호용) */
export function countOwners(projectId: number): number {
  return (
    sqlite
      .prepare(
        "SELECT COUNT(*) AS c FROM project_members WHERE project_id = ? AND perm = 'owner'"
      )
      .get(projectId) as { c: number }
  ).c;
}

/** 멤버 직군·권한 변경 */
export function updateMember(
  projectId: number,
  userId: number,
  role: ProjectRole,
  perm: Permission
): boolean {
  const r = sqlite
    .prepare(
      "UPDATE project_members SET role = ?, perm = ? WHERE project_id = ? AND user_id = ?"
    )
    .run(role, perm, projectId, userId);
  return r.changes > 0;
}

/** 멤버 제거 */
export function removeMember(projectId: number, userId: number): boolean {
  const r = sqlite
    .prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?")
    .run(projectId, userId);
  return r.changes > 0;
}

export type ProjectInvite = {
  id: number;
  email: string;
  role: ProjectRole;
  perm: Permission;
};

/** 프로젝트의 대기 중 초대 목록 (소유자 관리용) */
export function listProjectInvites(projectId: number): ProjectInvite[] {
  return sqlite
    .prepare(
      `SELECT id, email, role, perm FROM invites
       WHERE project_id = ? AND status = 'pending'
       ORDER BY id DESC`
    )
    .all(projectId) as ProjectInvite[];
}

/** 대기 중 초대 취소 (declined 처리) */
export function revokeInvite(inviteId: number, projectId: number): boolean {
  const r = sqlite
    .prepare(
      "UPDATE invites SET status = 'declined' WHERE id = ? AND project_id = ? AND status = 'pending'"
    )
    .run(inviteId, projectId);
  return r.changes > 0;
}

/** 멤버 추가/갱신 (이메일로 식별). 계정이 없으면 초대 행으로 남긴다(호출부 분기) */
export function addMemberByEmail(args: {
  projectId: number;
  email: string;
  role: ProjectRole;
  perm: Permission;
}): { added: boolean } {
  const user = getUserByEmail(args.email);
  if (!user) return { added: false };
  sqlite
    .prepare(
      `INSERT INTO project_members (project_id, user_id, role, perm, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, perm = excluded.perm`
    )
    .run(args.projectId, user.id, args.role, args.perm, now());
  return { added: true };
}

export function createInvite(args: {
  projectId: number;
  email: string;
  role: ProjectRole;
  perm: Permission;
  invitedBy: number;
}): number {
  const result = sqlite
    .prepare(
      "INSERT INTO invites (project_id, email, role, perm, invited_by, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)"
    )
    .run(
      args.projectId,
      args.email.trim().toLowerCase(),
      args.role,
      args.perm,
      args.invitedBy,
      now()
    );
  return Number(result.lastInsertRowid);
}

/** 이메일로 받은 대기 중 초대 (홈 "받은 초대") */
export function listInvitesForEmail(email: string): InviteInfo[] {
  const rows = sqlite
    .prepare(
      `SELECT i.id, i.project_id AS projectId, p.title AS title,
              COALESCE(NULLIF(TRIM(u.name), ''), u.username) AS fromName,
              i.role, i.perm
       FROM invites i
       JOIN projects p ON p.id = i.project_id
       JOIN users u ON u.id = i.invited_by
       WHERE i.email = ? AND i.status = 'pending'
       ORDER BY i.id DESC`
    )
    .all(email.trim().toLowerCase()) as (Omit<InviteInfo, "from"> & {
    fromName: string;
  })[];
  return rows.map(({ fromName, ...rest }) => ({ ...rest, from: fromName }));
}

/** 초대 수락 — 멤버십 추가 + 초대 accepted 표시. 대상 프로젝트 id 반환 */
export function acceptInvite(inviteId: number, userId: number): number | null {
  const tx = sqlite.transaction(() => {
    const iv = sqlite
      .prepare(
        "SELECT project_id AS projectId, role, perm, status FROM invites WHERE id = ?"
      )
      .get(inviteId) as
      | { projectId: number; role: ProjectRole; perm: Permission; status: InviteStatus }
      | undefined;
    if (!iv || iv.status !== "pending") return null;
    sqlite
      .prepare(
        `INSERT INTO project_members (project_id, user_id, role, perm, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, perm = excluded.perm`
      )
      .run(iv.projectId, userId, iv.role, iv.perm, now());
    sqlite
      .prepare("UPDATE invites SET status = 'accepted' WHERE id = ? AND status = 'pending'")
      .run(inviteId);
    return iv.projectId;
  });
  return tx();
}

export function declineInvite(inviteId: number, email: string): boolean {
  const result = sqlite
    .prepare(
      "UPDATE invites SET status = 'declined' WHERE id = ? AND email = ? AND status = 'pending'"
    )
    .run(inviteId, email.trim().toLowerCase());
  return result.changes > 0;
}

export function setProjectLinkShared(projectId: number, shared: boolean): void {
  sqlite
    .prepare("UPDATE projects SET link_shared = ? WHERE id = ?")
    .run(shared ? 1 : 0, projectId);
}

// ---------------------------------------------------------------------------
// v0.2 입장 승인 (join_requests) — 사용자→소유자 방향. 승인 시 멤버 합류.
// ---------------------------------------------------------------------------

export type JoinRequestInfo = {
  id: number;
  userId: number;
  name: string;
  email: string;
  requestedRole: ProjectRole;
  message: string | null;
  createdAt: string;
};

/** 가시성 가드 없는 프로젝트 기본 정보 — 입장 요청 화면(비멤버)용 */
export function getProjectMeta(
  projectId: number
): { id: number; title: string; linkShared: boolean } | null {
  const row = sqlite
    .prepare(
      "SELECT id, title, link_shared AS linkShared FROM projects WHERE id = ?"
    )
    .get(projectId) as
    | { id: number; title: string; linkShared: number }
    | undefined;
  if (!row) return null;
  return { id: row.id, title: row.title, linkShared: row.linkShared === 1 };
}

/**
 * 입장 요청 제출 (멱등). 이미 멤버면 아무 것도 하지 않고 alreadyMember.
 * (project_id, user_id) 유니크 — 재요청 시 기존 행을 pending으로 되돌린다.
 */
export function createJoinRequest(args: {
  projectId: number;
  userId: number;
  requestedRole: ProjectRole;
  message?: string | null;
}): { ok: boolean; alreadyMember: boolean } {
  if (getMembership(args.projectId, args.userId)) {
    return { ok: false, alreadyMember: true };
  }
  sqlite
    .prepare(
      `INSERT INTO join_requests (project_id, user_id, requested_role, message, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)
       ON CONFLICT(project_id, user_id) DO UPDATE SET
         requested_role = excluded.requested_role,
         message = excluded.message,
         status = 'pending',
         created_at = excluded.created_at,
         decided_by = NULL,
         decided_at = NULL`
    )
    .run(
      args.projectId,
      args.userId,
      args.requestedRole,
      args.message?.trim() || null,
      now()
    );
  return { ok: true, alreadyMember: false };
}

/** 프로젝트의 대기 중 입장 요청 (소유자 관리용) */
export function listJoinRequests(projectId: number): JoinRequestInfo[] {
  return sqlite
    .prepare(
      `SELECT jr.id, jr.user_id AS userId,
              COALESCE(NULLIF(TRIM(u.name), ''), u.username) AS name,
              COALESCE(u.email, '') AS email,
              jr.requested_role AS requestedRole, jr.message, jr.created_at AS createdAt
       FROM join_requests jr
       JOIN users u ON u.id = jr.user_id
       WHERE jr.project_id = ? AND jr.status = 'pending'
       ORDER BY jr.id DESC`
    )
    .all(projectId) as JoinRequestInfo[];
}

/** 내 입장 요청 상태 (요청자 화면용) */
export function getMyJoinRequest(
  projectId: number,
  userId: number
): { status: JoinRequestStatus } | null {
  const row = sqlite
    .prepare(
      "SELECT status FROM join_requests WHERE project_id = ? AND user_id = ?"
    )
    .get(projectId, userId) as { status: JoinRequestStatus } | undefined;
  return row ?? null;
}

/**
 * 입장 요청 승인 — 멤버십 추가(기본 권한 editor) + 요청 approved 표시. 단일 트랜잭션.
 * 승인 권한 가드(소유자 여부)는 호출부(action)에서 확인한다.
 */
export function approveJoinRequest(
  requestId: number,
  projectId: number,
  decidedBy: number,
  perm: Permission = "editor"
): { ok: boolean } {
  const tx = sqlite.transaction(() => {
    const jr = sqlite
      .prepare(
        "SELECT user_id AS userId, requested_role AS role, status FROM join_requests WHERE id = ? AND project_id = ?"
      )
      .get(requestId, projectId) as
      | { userId: number; role: ProjectRole; status: JoinRequestStatus }
      | undefined;
    if (!jr || jr.status !== "pending") return { ok: false };
    sqlite
      .prepare(
        `INSERT INTO project_members (project_id, user_id, role, perm, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role, perm = excluded.perm`
      )
      .run(projectId, jr.userId, jr.role, perm, now());
    sqlite
      .prepare(
        "UPDATE join_requests SET status = 'approved', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'"
      )
      .run(decidedBy, now(), requestId);
    return { ok: true };
  });
  return tx();
}

/** 입장 요청 거절 */
export function rejectJoinRequest(
  requestId: number,
  projectId: number,
  decidedBy: number
): boolean {
  const r = sqlite
    .prepare(
      "UPDATE join_requests SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ? AND project_id = ? AND status = 'pending'"
    )
    .run(decidedBy, now(), requestId, projectId);
  return r.changes > 0;
}

// ---------------------------------------------------------------------------
// v0.2 채팅 첨부 (attachments) — 파일/링크. 텍스트·링크는 AI 근거로 사용.
// ---------------------------------------------------------------------------

export type AttachmentInfo = {
  id: number;
  messageId: number | null;
  kind: AttachmentKind;
  url: string | null;
  path: string | null;
  mime: string | null;
  title: string | null;
  textExcerpt: string | null;
  createdAt: string;
};

export function addAttachment(args: {
  docId: number;
  messageId?: number | null;
  kind: AttachmentKind;
  url?: string | null;
  path?: string | null;
  mime?: string | null;
  title?: string | null;
  textExcerpt?: string | null;
  uploadedBy?: number | null;
}): number {
  const r = sqlite
    .prepare(
      `INSERT INTO attachments (doc_id, message_id, kind, url, path, mime, title, text_excerpt, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.docId,
      args.messageId ?? null,
      args.kind,
      args.url ?? null,
      args.path ?? null,
      args.mime ?? null,
      args.title ?? null,
      args.textExcerpt ?? null,
      args.uploadedBy ?? null,
      now()
    );
  return Number(r.lastInsertRowid);
}

export function listAttachments(docId: number): AttachmentInfo[] {
  return sqlite
    .prepare(
      `SELECT id, message_id AS messageId, kind, url, path, mime, title,
              text_excerpt AS textExcerpt, created_at AS createdAt
       FROM attachments WHERE doc_id = ? ORDER BY id ASC`
    )
    .all(docId) as AttachmentInfo[];
}

export function listAttachmentsForMessage(messageId: number): AttachmentInfo[] {
  return sqlite
    .prepare(
      `SELECT id, message_id AS messageId, kind, url, path, mime, title,
              text_excerpt AS textExcerpt, created_at AS createdAt
       FROM attachments WHERE message_id = ? ORDER BY id ASC`
    )
    .all(messageId) as AttachmentInfo[];
}

// ---------------------------------------------------------------------------
// v0.2 메시지 관련도·분류 (message_relevance) — AI 판정 + 사람 교정.
// ---------------------------------------------------------------------------

export type MessageRelevance = {
  messageId: number;
  aiSectionKey: string | null;
  aiRelevance: number | null;
  aiReason: string | null;
  pinned: boolean;
  excluded: boolean;
  overrideSectionKey: string | null;
};

/** AI 분류 결과 기록 (사람 교정값 pinned/excluded/override는 보존) */
export function upsertMessageRelevanceAI(args: {
  messageId: number;
  aiSectionKey: string | null;
  aiRelevance: number | null;
  aiReason?: string | null;
}): void {
  sqlite
    .prepare(
      `INSERT INTO message_relevance (message_id, ai_section_key, ai_relevance, ai_reason, classified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET
         ai_section_key = excluded.ai_section_key,
         ai_relevance = excluded.ai_relevance,
         ai_reason = excluded.ai_reason,
         classified_at = excluded.classified_at,
         updated_at = excluded.updated_at`
    )
    .run(
      args.messageId,
      args.aiSectionKey,
      args.aiRelevance,
      args.aiReason ?? null,
      now(),
      now()
    );
}

function ensureRelevanceRow(messageId: number): void {
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO message_relevance (message_id, updated_at) VALUES (?, ?)"
    )
    .run(messageId, now());
}

/** 사람 교정: 백서 반영 핀 토글 */
export function setMessagePinned(messageId: number, pinned: boolean): void {
  ensureRelevanceRow(messageId);
  sqlite
    .prepare(
      "UPDATE message_relevance SET pinned = ?, updated_at = ? WHERE message_id = ?"
    )
    .run(pinned ? 1 : 0, now(), messageId);
}

/** 사람 교정: 백서 제외 토글 */
export function setMessageExcluded(messageId: number, excluded: boolean): void {
  ensureRelevanceRow(messageId);
  sqlite
    .prepare(
      "UPDATE message_relevance SET excluded = ?, updated_at = ? WHERE message_id = ?"
    )
    .run(excluded ? 1 : 0, now(), messageId);
}

/** 사람 교정: 절 재분류 (NULL이면 AI 분류값 사용) */
export function setMessageOverrideSection(
  messageId: number,
  sectionKey: string | null
): void {
  ensureRelevanceRow(messageId);
  sqlite
    .prepare(
      "UPDATE message_relevance SET override_section_key = ?, updated_at = ? WHERE message_id = ?"
    )
    .run(sectionKey, now(), messageId);
}

export function getMessageRelevance(
  messageId: number
): MessageRelevance | null {
  const row = sqlite
    .prepare(
      `SELECT message_id AS messageId, ai_section_key AS aiSectionKey,
              ai_relevance AS aiRelevance, ai_reason AS aiReason,
              pinned, excluded, override_section_key AS overrideSectionKey
       FROM message_relevance WHERE message_id = ?`
    )
    .get(messageId) as
    | (Omit<MessageRelevance, "pinned" | "excluded"> & {
        pinned: number;
        excluded: number;
      })
    | undefined;
  if (!row) return null;
  return { ...row, pinned: row.pinned === 1, excluded: row.excluded === 1 };
}

/** 분류 작업 — 아직 AI 분류되지 않은 메시지(잠긴 블록) */
export type ClassifyJob = { messageId: number; sourceMd: string };

/**
 * 아직 분류되지 않은(classified_at IS NULL) 잠긴 블록 목록.
 * 렌더 시 호출돼도 안전 — 행이 없거나 미분류인 것만 반환(호출부가 after()로 생성).
 */
export function ensureMessageClassifications(docId: number): ClassifyJob[] {
  return sqlite
    .prepare(
      `SELECT b.id AS messageId, b.source_md AS sourceMd
       FROM blocks b
       LEFT JOIN message_relevance mr ON mr.message_id = b.id
       WHERE b.doc_id = ? AND b.status = 'locked'
         AND (mr.id IS NULL OR mr.classified_at IS NULL)
       ORDER BY b.locked_at ASC, b.seq ASC`
    )
    .all(docId) as ClassifyJob[];
}

/** 메시지별 분류·관련도·교정 상태 (effective = override ?? ai) — 채팅 렌더용 */
export type MessageRelevanceView = {
  messageId: number;
  sectionKey: string | null; // 사람 교정(override) 우선, 없으면 AI 분류
  aiSectionKey: string | null;
  relevance: number | null;
  pinned: boolean;
  excluded: boolean;
  classified: boolean;
};

export function getMessageRelevances(docId: number): MessageRelevanceView[] {
  const rows = sqlite
    .prepare(
      `SELECT mr.message_id AS messageId, mr.ai_section_key AS aiSectionKey,
              mr.ai_relevance AS relevance, mr.pinned, mr.excluded,
              mr.override_section_key AS overrideSectionKey, mr.classified_at AS classifiedAt
       FROM message_relevance mr
       JOIN blocks b ON b.id = mr.message_id
       WHERE b.doc_id = ?`
    )
    .all(docId) as {
    messageId: number;
    aiSectionKey: string | null;
    relevance: number | null;
    pinned: number;
    excluded: number;
    overrideSectionKey: string | null;
    classifiedAt: string | null;
  }[];
  return rows.map((r) => ({
    messageId: r.messageId,
    sectionKey: r.overrideSectionKey ?? r.aiSectionKey,
    aiSectionKey: r.aiSectionKey,
    relevance: r.relevance,
    pinned: r.pinned === 1,
    excluded: r.excluded === 1,
    classified: r.classifiedAt !== null,
  }));
}

/**
 * 문서 뷰어의 코어 역할 — 문서가 프로젝트에 속하면 그 사람의 멤버십 직군을
 * 2축(planner/developer)으로 매핑해 반환한다. 멤버십이 없으면 계정 전역 역할로 폴백.
 * (레거시 문서·시드 계정은 기존 동작 그대로 유지)
 */
export function getDocRole(docId: number, userId: number): Role | null {
  const doc = sqlite
    .prepare("SELECT project_id AS projectId FROM documents WHERE id = ?")
    .get(docId) as { projectId: number | null } | undefined;
  if (!doc) return null;
  if (doc.projectId != null) {
    const m = getMembership(doc.projectId, userId);
    if (m) return toCoreRole(m.role);
  }
  const u = getUserById(userId);
  return u?.role ?? null;
}

/**
 * 문서 뷰어의 4직군 — 프로젝트 멤버십 직군을 그대로 반환(번역 렌더링용).
 * 멤버십이 없으면 계정 전역 역할(2축, ProjectRole의 부분집합)로 폴백.
 */
export function getDocProjectRole(
  docId: number,
  userId: number
): ProjectRole | null {
  const projectId = getProjectIdForDoc(docId);
  if (projectId != null) {
    const m = getMembership(projectId, userId);
    if (m) return m.role;
  }
  const u = getUserById(userId);
  return u?.role ?? null;
}

/** 프로젝트에 존재하는 서로 다른 직군들 (번역을 생성할 대상 직군 집합) */
export function getDistinctMemberRoles(projectId: number): ProjectRole[] {
  return (
    sqlite
      .prepare("SELECT DISTINCT role FROM project_members WHERE project_id = ?")
      .all(projectId) as { role: ProjectRole }[]
  ).map((r) => r.role);
}

/** 프로젝트 멤버들의 서로 다른 (직군 × 언어) 조합 — 보내기 시 사전 번역 대상 */
export function getDistinctMemberRoleLangs(
  projectId: number
): { role: ProjectRole; lang: Lang }[] {
  return sqlite
    .prepare(
      `SELECT DISTINCT pm.role AS role, u.lang AS lang
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ?`
    )
    .all(projectId) as { role: ProjectRole; lang: Lang }[];
}

/** 해당 직군 멤버의 숙련도 — 번역 표현 수준 조정용 (없으면 intermediate) */
export function getLevelForProjectRole(
  projectId: number,
  role: ProjectRole
): ExpertiseLevel {
  const row = sqlite
    .prepare(
      `SELECT u.level FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? AND pm.role = ?
       ORDER BY pm.id ASC LIMIT 1`
    )
    .get(projectId, role) as { level: ExpertiseLevel } | undefined;
  return row?.level ?? "intermediate";
}

/** 내보내기용 — 문서의 모든 (블록×직군) 번역 행 */
export type BlockTranslationRow = {
  blockId: number;
  targetRole: ProjectRole;
  targetLang: Lang;
  status: TranslationStatus;
  translatedMd: string | null;
};
export function listBlockTranslations(docId: number): BlockTranslationRow[] {
  return sqlite
    .prepare(
      `SELECT t.block_id AS blockId, t.target_role AS targetRole,
              t.target_lang AS targetLang, t.status, t.translated_md AS translatedMd
       FROM block_translations t
       JOIN blocks b ON b.id = t.block_id
       WHERE b.doc_id = ?
       ORDER BY t.block_id ASC, t.target_role ASC, t.target_lang ASC`
    )
    .all(docId) as BlockTranslationRow[];
}

// ---------------------------------------------------------------------------
// 프로젝트 내 문서 (본문 / 회의록 / 릴리스)
// ---------------------------------------------------------------------------

/** 프로젝트 워크스페이스 문서 한 줄 */
export type ProjectDocItem = {
  id: number;
  title: string;
  kind: DocKind;
  status: DocumentStatus;
  createdAt: string | null;
  blockCount: number;
  lastLockedAt: string | null;
  agreed: boolean;
};

/** 문서의 프로젝트 맥락 (브레드크럼·종류 표기) — 레거시 문서는 projectId null */
export type DocContext = {
  projectId: number | null;
  projectTitle: string | null;
  kind: DocKind;
};


export function listProjectDocuments(projectId: number): ProjectDocItem[] {
  const rows = sqlite
    .prepare(
      `SELECT d.id, d.title, d.kind, d.status,
              d.created_at AS createdAt,
              d.approval_planner_at AS approvalPlannerAt,
              d.approval_developer_at AS approvalDeveloperAt,
              COUNT(b.id) AS blockCount,
              MAX(b.locked_at) AS lastLockedAt
       FROM documents d
       LEFT JOIN blocks b ON b.doc_id = d.id AND b.status = 'locked'
       WHERE d.project_id = ?
       GROUP BY d.id
       ORDER BY
         CASE d.kind WHEN 'main' THEN 0 WHEN 'meeting' THEN 1 ELSE 2 END,
         COALESCE(MAX(b.locked_at), d.created_at, '') DESC, d.id DESC`
    )
    .all(projectId) as (Omit<ProjectDocItem, "agreed"> & {
    approvalPlannerAt: string | null;
    approvalDeveloperAt: string | null;
  })[];
  return rows.map(({ approvalPlannerAt, approvalDeveloperAt, ...rest }) => ({
    ...rest,
    agreed: Boolean(approvalPlannerAt && approvalDeveloperAt),
  }));
}

export function getProjectIdForDoc(docId: number): number | null {
  const row = sqlite
    .prepare("SELECT project_id AS projectId FROM documents WHERE id = ?")
    .get(docId) as { projectId: number | null } | undefined;
  return row?.projectId ?? null;
}

/** 백서 절 세부 항목 (증류된 산문) — 백서 리더가 절 단위로 묶어 보여준다 */
export type SectionContentItem = {
  id: number;
  sectionKey: SectionKey;
  subKey: string | null;
  title: string | null;
  bodyMd: string;
  status: "agreed" | "discussing" | "draft";
  sourceThreadId: number | null;
  sourceSig: string | null;
  orderIndex: number;
};

const SECTION_CONTENT_COLS =
  `id, section_key AS sectionKey, sub_key AS subKey, title,
   body_md AS bodyMd, status, source_thread_id AS sourceThreadId,
   source_sig AS sourceSig, order_index AS orderIndex`;

export function listSectionContent(docId: number): SectionContentItem[] {
  return sqlite
    .prepare(
      `SELECT ${SECTION_CONTENT_COLS}
       FROM section_content
       WHERE doc_id = ?
       ORDER BY order_index ASC, id ASC`
    )
    .all(docId) as SectionContentItem[];
}

// --- 백서 산문 자연어 번역 (section_content_i18n 캐시) ---

/** 콘텐츠 항목의 i18n 캐시 키 — 수정 시각(없으면 생성 시각) */
function sectionContentSig(updatedAt: string | null, createdAt: string): string {
  return updatedAt ?? createdAt;
}

export type SectionI18nJob = {
  contentId: number;
  lang: Lang;
  sourceTitle: string | null;
  sourceBody: string;
};

/**
 * 뷰어 언어로 본 백서 절 항목. lang!=ko이고 번역(i18n) ok면 번역본 title/body, 아니면
 * 한국어 정본으로 폴백한다(번역 대기/실패해도 백서는 항상 보인다).
 */
export function getSectionContentForLang(
  docId: number,
  lang: Lang
): SectionContentItem[] {
  if (lang === "ko") return listSectionContent(docId);
  const rows = sqlite
    .prepare(
      `SELECT sc.id, sc.section_key AS sectionKey, sc.sub_key AS subKey,
              sc.title, sc.body_md AS bodyMd, sc.status,
              sc.source_thread_id AS sourceThreadId, sc.source_sig AS sourceSig,
              sc.order_index AS orderIndex,
              i.title AS i18nTitle, i.body_md AS i18nBody, i.status AS i18nStatus
       FROM section_content sc
       LEFT JOIN section_content_i18n i ON i.content_id = sc.id AND i.lang = ?
       WHERE sc.doc_id = ?
       ORDER BY sc.order_index ASC, sc.id ASC`
    )
    .all(lang, docId) as (SectionContentItem & {
    i18nTitle: string | null;
    i18nBody: string | null;
    i18nStatus: TranslationStatus | null;
  })[];
  return rows.map(({ i18nTitle, i18nBody, i18nStatus, ...item }) =>
    i18nStatus === "ok" && i18nBody
      ? { ...item, title: i18nTitle, bodyMd: i18nBody }
      : item
  );
}

/** 뷰어 언어로 누락된 백서 절 번역 작업 — pending 선삽입 후 작업 반환 */
export function ensureSectionTranslations(
  docId: number,
  lang: Lang
): SectionI18nJob[] {
  if (lang === "ko") return [];
  const rows = sqlite
    .prepare(
      `SELECT id, title, body_md AS bodyMd, updated_at AS updatedAt, created_at AS createdAt
       FROM section_content WHERE doc_id = ?`
    )
    .all(docId) as {
    id: number;
    title: string | null;
    bodyMd: string;
    updatedAt: string | null;
    createdAt: string;
  }[];

  const jobs: SectionI18nJob[] = [];
  for (const r of rows) {
    const sig = sectionContentSig(r.updatedAt, r.createdAt);
    const existing = sqlite
      .prepare(
        "SELECT status, source_sig AS sourceSig FROM section_content_i18n WHERE content_id = ? AND lang = ?"
      )
      .get(r.id, lang) as
      | { status: TranslationStatus; sourceSig: string | null }
      | undefined;
    // 같은 시그니처 행이 있으면(상태 무관) 건너뛴다 — 렌더 반복 호출 시 재생성 폭주 방지.
    // 콘텐츠가 바뀌어 sig가 달라졌을 때만 재생성한다.
    if (existing && existing.sourceSig === sig) continue;
    sqlite
      .prepare(
        `INSERT INTO section_content_i18n (content_id, lang, status, source_sig, created_at, attempt_at)
         VALUES (?, ?, 'pending', ?, ?, ?)
         ON CONFLICT(content_id, lang)
         DO UPDATE SET status='pending', source_sig=excluded.source_sig, attempt_at=excluded.attempt_at`
      )
      .run(r.id, lang, sig, now(), now());
    jobs.push({ contentId: r.id, lang, sourceTitle: r.title, sourceBody: r.bodyMd });
  }
  return jobs;
}

/** 백서 절 번역 결과 기록 (조건부 — pending일 때만) */
export function recordSectionI18n(
  contentId: number,
  lang: Lang,
  result: { ok: true; title: string; bodyMd: string } | { ok: false }
): void {
  if (result.ok) {
    sqlite
      .prepare(
        `UPDATE section_content_i18n SET status='ok', title=?, body_md=?
         WHERE content_id=? AND lang=? AND status='pending'`
      )
      .run(result.title, result.bodyMd, contentId, lang);
  } else {
    sqlite
      .prepare(
        `UPDATE section_content_i18n SET status='failed'
         WHERE content_id=? AND lang=? AND status='pending'`
      )
      .run(contentId, lang);
  }
}

/** 한 절의 대화(잠긴 블록) — 증류 입력 */
export function getSectionConversation(
  docId: number,
  sectionKey: SectionKey
): { id: number; sourceMd: string; authorRole: ProjectRole }[] {
  return sqlite
    .prepare(
      `SELECT id, source_md AS sourceMd,
              COALESCE(author_project_role, author_role) AS authorRole
       FROM blocks
       WHERE doc_id = ? AND section_key = ? AND status = 'locked'
       ORDER BY seq ASC`
    )
    .all(docId, sectionKey) as {
    id: number;
    sourceMd: string;
    authorRole: ProjectRole;
  }[];
}

/** 절 대화의 증류 캐시 시그니처 ("개수:최대블록id"). 대화가 바뀌면 값이 바뀐다 */
export function sectionSourceSig(docId: number, sectionKey: SectionKey): string {
  const r = sqlite
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(MAX(id), 0) AS maxId
       FROM blocks
       WHERE doc_id = ? AND section_key = ? AND status = 'locked'`
    )
    .get(docId, sectionKey) as { c: number; maxId: number };
  return `${r.c}:${r.maxId}`;
}

// ---------------------------------------------------------------------------
// v0.2 자동 증류 — 입력을 blocks.section_key가 아니라 메시지 분류(message_relevance)에서
// 가져온다. AI가 분류한(효과적 절 = override ?? ai) 메시지 중 제외되지 않은 것을 모은다.
// ---------------------------------------------------------------------------

/** 분류 결과로 이 절에 속하는 메시지(제외 제외, 분류 완료) — 자동 증류 입력 */
export function getClassifiedSectionMessages(
  docId: number,
  sectionKey: SectionKey
): { id: number; sourceMd: string; authorRole: ProjectRole }[] {
  return sqlite
    .prepare(
      `SELECT b.id, b.source_md AS sourceMd,
              COALESCE(b.author_project_role, b.author_role) AS authorRole
       FROM blocks b
       JOIN message_relevance mr ON mr.message_id = b.id
       WHERE b.doc_id = ? AND b.status = 'locked'
         AND mr.classified_at IS NOT NULL AND mr.excluded = 0
         AND COALESCE(mr.override_section_key, mr.ai_section_key) = ?
       ORDER BY b.locked_at ASC, b.seq ASC`
    )
    .all(docId, sectionKey) as {
    id: number;
    sourceMd: string;
    authorRole: ProjectRole;
  }[];
}

/** 분류 기반 증류 시그니처 ("개수:최대id"). 분류·제외·재분류가 바뀌면 값이 바뀐다 */
export function classifiedSectionSig(
  docId: number,
  sectionKey: SectionKey
): string {
  const r = sqlite
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(MAX(b.id), 0) AS maxId
       FROM blocks b
       JOIN message_relevance mr ON mr.message_id = b.id
       WHERE b.doc_id = ? AND b.status = 'locked'
         AND mr.classified_at IS NOT NULL AND mr.excluded = 0
         AND COALESCE(mr.override_section_key, mr.ai_section_key) = ?`
    )
    .get(docId, sectionKey) as { c: number; maxId: number };
  return `${r.c}:${r.maxId}`;
}

/** 자동 증류 작업 — 내용이 바뀐(시그니처 불일치) 절만. (호출부가 after()로 실행) */
export type DistillJob = {
  docId: number;
  sectionKey: SectionKey;
  sectionTitle: string;
  blocks: { sourceMd: string; authorRole: ProjectRole }[];
  sig: string;
};
export function ensureSectionDistills(docId: number): DistillJob[] {
  const jobs: DistillJob[] = [];
  for (const s of CONTENT_SECTIONS) {
    const msgs = getClassifiedSectionMessages(docId, s.key);
    if (msgs.length === 0) continue; // 아직 이 절에 분류된 대화 없음
    const sig = classifiedSectionSig(docId, s.key);
    const existing = getDistilledItem(docId, s.key);
    if (existing && existing.sourceSig === sig) continue; // 이미 최신
    jobs.push({
      docId,
      sectionKey: s.key,
      sectionTitle: sectionLabel(s.key),
      blocks: msgs.map((m) => ({ sourceMd: m.sourceMd, authorRole: m.authorRole })),
      sig,
    });
  }
  return jobs;
}

const distilledSubKey = (sectionKey: SectionKey) => `${sectionKey}.distilled`;

/** 그 절의 증류 산문 행(있으면) */
export function getDistilledItem(
  docId: number,
  sectionKey: SectionKey
): SectionContentItem | null {
  const row = sqlite
    .prepare(
      `SELECT ${SECTION_CONTENT_COLS}
       FROM section_content
       WHERE doc_id = ? AND sub_key = ?`
    )
    .get(docId, distilledSubKey(sectionKey)) as SectionContentItem | undefined;
  return row ?? null;
}

/** 증류 결과 저장(upsert) — 같은 (doc, 절)의 증류 행을 갱신, 없으면 절 끝에 추가. status='agreed' */
export function upsertDistilledSection(
  docId: number,
  sectionKey: SectionKey,
  data: { title: string; bodyMd: string; sig: string }
): void {
  const subKey = distilledSubKey(sectionKey);
  const existing = getDistilledItem(docId, sectionKey);
  if (existing) {
    sqlite
      .prepare(
        `UPDATE section_content
         SET title = ?, body_md = ?, status = 'agreed', source_sig = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(data.title, data.bodyMd, data.sig, now(), existing.id);
    return;
  }
  const maxOrder = sqlite
    .prepare(
      "SELECT COALESCE(MAX(order_index), -1) AS m FROM section_content WHERE doc_id = ? AND section_key = ?"
    )
    .get(docId, sectionKey) as { m: number };
  sqlite
    .prepare(
      `INSERT INTO section_content (doc_id, section_key, sub_key, title, body_md, status, source_sig, order_index, created_at)
       VALUES (?, ?, ?, ?, ?, 'agreed', ?, ?, ?)`
    )
    .run(docId, sectionKey, subKey, data.title, data.bodyMd, data.sig, maxOrder.m + 1, now());
}

// ---------------------------------------------------------------------------
// 파생 기록 — 회의록(blocks 파생) / 릴리스(append-only 스냅샷)
// ---------------------------------------------------------------------------

/** 회의록 항목 — 잠긴 블록(대화) 한 건. 화면에서 날짜별로 묶는다 */
export type MeetingLogEntry = {
  id: number;
  versionTag: string;
  authorRole: ProjectRole;
  sectionKey: SectionKey | null;
  sourceMd: string;
  lockedAt: string;
};

/** 회의록 원천 — 문서의 모든 잠긴 블록(원문), 시간순 */
export function getMeetingLog(docId: number): MeetingLogEntry[] {
  return sqlite
    .prepare(
      `SELECT id, version_tag AS versionTag,
              COALESCE(author_project_role, author_role) AS authorRole,
              section_key AS sectionKey, source_md AS sourceMd, locked_at AS lockedAt
       FROM blocks
       WHERE doc_id = ? AND status = 'locked'
       ORDER BY locked_at ASC, seq ASC`
    )
    .all(docId) as MeetingLogEntry[];
}

export type ReleaseEntry = {
  id: number;
  sectionKey: SectionKey;
  title: string | null;
  bodyMd: string;
  versionLabel: string;
  createdAt: string;
};

/** 릴리스 스냅샷 추가 (append-only) — 증류·합의 시점의 결정을 박제 */
export function addReleaseEntry(
  docId: number,
  data: {
    sectionKey: SectionKey;
    title: string;
    bodyMd: string;
    createdBy: number | null;
  }
): string {
  const n =
    (
      sqlite
        .prepare("SELECT COUNT(*) AS c FROM release_entries WHERE doc_id = ?")
        .get(docId) as { c: number }
    ).c + 1;
  const versionLabel = `r${n}`;
  sqlite
    .prepare(
      `INSERT INTO release_entries (doc_id, section_key, title, body_md, version_label, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(docId, data.sectionKey, data.title, data.bodyMd, versionLabel, data.createdBy, now());
  return versionLabel;
}

/** 릴리스 노트 — 최신 스냅샷 먼저 */
export function listReleaseEntries(docId: number): ReleaseEntry[] {
  return sqlite
    .prepare(
      `SELECT id, section_key AS sectionKey, title, body_md AS bodyMd,
              version_label AS versionLabel, created_at AS createdAt
       FROM release_entries
       WHERE doc_id = ?
       ORDER BY id DESC`
    )
    .all(docId) as ReleaseEntry[];
}

export function getDocContext(docId: number): DocContext | null {
  const row = sqlite
    .prepare(
      `SELECT d.kind, d.project_id AS projectId, p.title AS projectTitle
       FROM documents d
       LEFT JOIN projects p ON p.id = d.project_id
       WHERE d.id = ?`
    )
    .get(docId) as
    | { kind: DocKind; projectId: number | null; projectTitle: string | null }
    | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// 멤버별 합의 서명 (1인1서명 기록 — 게이트는 approval_*_at 유지)
// ---------------------------------------------------------------------------

export type SignatureInfo = {
  userId: number;
  name: string;
  role: ProjectRole;
  signedAt: string;
};

/** 현재 사용자의 합의 서명 기록(upsert) — 직군은 멤버십에서 받은 4직군 표시값 */
export function addSignature(
  docId: number,
  userId: number,
  role: ProjectRole
): void {
  sqlite
    .prepare(
      `INSERT INTO signatures (doc_id, user_id, role, signed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(doc_id, user_id) DO UPDATE SET role = excluded.role, signed_at = excluded.signed_at`
    )
    .run(docId, userId, role, now());
}

export function listSignatures(docId: number): SignatureInfo[] {
  return sqlite
    .prepare(
      `SELECT s.user_id AS userId,
              COALESCE(NULLIF(TRIM(u.name), ''), u.username) AS name,
              s.role, s.signed_at AS signedAt
       FROM signatures s
       JOIN users u ON u.id = s.user_id
       WHERE s.doc_id = ?
       ORDER BY s.signed_at ASC, s.id ASC`
    )
    .all(docId) as SignatureInfo[];
}
