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

import { sqlite } from "./db";
import type { Role, TranslationStatus } from "./schema";

export type { Role, BlockStatus, TranslationStatus } from "./schema";

// ---------------------------------------------------------------------------
// 타입 (page.tsx → 컴포넌트 props로 그대로 전달되는 형태)
// ---------------------------------------------------------------------------

export type UserRow = {
  id: number;
  username: string;
  passwordHash: string;
  role: Role;
};

export type DocumentInfo = {
  id: number;
  title: string;
  approvalPlannerAt: string | null;
  approvalDeveloperAt: string | null;
};

export type TranslationInfo = {
  blockId: number;
  targetRole: Role;
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
  authorRole: Role;
  sourceMd: string;
  status: "locked";
  lockedAt: string;
  versionTag: string;
  seq: number;
  translation: TranslationInfo | null;
  comments: CommentInfo[];
};

export type DraftBlock = {
  id: number;
  docId: number;
  authorId: number;
  authorRole: Role;
  sourceMd: string;
  status: "draft";
};

export type AbstractInfo = {
  id: number;
  docId: number;
  abstractMd: string;
  tocMd: string;
  generatedAt: string;
};

/** sendBlock 결과 — 호출부가 트랜잭션 밖에서 translate()를 호출할 때 필요한 정보 */
export type SentBlock = {
  blockId: number;
  docId: number;
  sourceMd: string;
  targetRole: Role;
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

export const oppositeRole = (role: Role): Role =>
  role === "planner" ? "developer" : "planner";

// ---------------------------------------------------------------------------
// 사용자
// ---------------------------------------------------------------------------

export function getUserByUsername(username: string): UserRow | null {
  const row = sqlite
    .prepare(
      "SELECT id, username, password_hash AS passwordHash, role FROM users WHERE username = ?"
    )
    .get(username) as UserRow | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// 문서
// ---------------------------------------------------------------------------

export function getDocument(docId: number): DocumentInfo | null {
  const row = sqlite
    .prepare(
      `SELECT id, title,
              approval_planner_at AS approvalPlannerAt,
              approval_developer_at AS approvalDeveloperAt
       FROM documents WHERE id = ?`
    )
    .get(docId) as DocumentInfo | undefined;
  return row ?? null;
}

export function getFirstDocumentId(): number | null {
  const row = sqlite
    .prepare("SELECT id FROM documents ORDER BY id ASC LIMIT 1")
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

// ---------------------------------------------------------------------------
// 타임라인 (locked 블록만 — draft는 절대 포함되지 않음)
// ---------------------------------------------------------------------------

export function getTimeline(docId: number): TimelineBlock[] {
  const blocks = sqlite
    .prepare(
      `SELECT id, doc_id AS docId, author_id AS authorId, author_role AS authorRole,
              source_md AS sourceMd, status, locked_at AS lockedAt,
              version_tag AS versionTag, seq
       FROM blocks
       WHERE doc_id = ? AND status = 'locked'
       ORDER BY seq ASC`
    )
    .all(docId) as Omit<TimelineBlock, "translation" | "comments">[];

  if (blocks.length === 0) return [];

  const translations = sqlite
    .prepare(
      `SELECT t.block_id AS blockId, t.target_role AS targetRole,
              t.translated_md AS translatedMd, t.status,
              t.created_at AS createdAt, t.attempt_at AS attemptAt
       FROM translations t
       JOIN blocks b ON b.id = t.block_id
       WHERE b.doc_id = ?`
    )
    .all(docId) as TranslationInfo[];
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
export function getOwnDraft(docId: number, authorId: number): DraftBlock | null {
  const row = sqlite
    .prepare(
      `SELECT id, doc_id AS docId, author_id AS authorId, author_role AS authorRole,
              source_md AS sourceMd, status
       FROM blocks
       WHERE doc_id = ? AND author_id = ? AND status = 'draft'
       ORDER BY id DESC LIMIT 1`
    )
    .get(docId, authorId) as DraftBlock | undefined;
  return row ?? null;
}

/** 초안 저장(upsert): 기존 draft가 있으면 조건부 UPDATE, 없으면 INSERT. blockId 반환 */
export function saveDraft(
  docId: number,
  author: { id: number; role: Role },
  md: string
): number {
  const existing = getOwnDraft(docId, author.id);
  if (existing) {
    updateDraft(existing.id, author.id, md);
    return existing.id;
  }
  const result = sqlite
    .prepare(
      `INSERT INTO blocks (doc_id, author_id, author_role, source_md, status)
       VALUES (?, ?, ?, ?, 'draft')`
    )
    .run(docId, author.id, author.role, md);
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
        `SELECT id, doc_id AS docId, author_role AS authorRole, source_md AS sourceMd
         FROM blocks
         WHERE id = ? AND author_id = ? AND status = 'draft'`
      )
      .get(blockId, authorId) as
      | { id: number; docId: number; authorRole: Role; sourceMd: string }
      | undefined;
    if (!block) throw new Error("보낼 수 있는 초안이 없습니다.");
    if (block.sourceMd.trim().length === 0)
      throw new Error("빈 초안은 보낼 수 없습니다.");

    const maxSeq = sqlite
      .prepare(
        `SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM blocks
         WHERE doc_id = ? AND status = 'locked'`
      )
      .get(block.docId) as { maxSeq: number };
    const seq = maxSeq.maxSeq + 1;
    const lockedAt = now();
    const versionTag = `[${dateStamp()} v${seq} - ${roleLabel[block.authorRole]}]`;

    // (a) 잠금 — WHERE status='draft' 조건으로 트리거와 충돌 없음
    const locked = sqlite
      .prepare(
        `UPDATE blocks SET status = 'locked', locked_at = ?, version_tag = ?, seq = ?
         WHERE id = ? AND status = 'draft'`
      )
      .run(lockedAt, versionTag, seq, blockId);
    if (locked.changes !== 1) throw new Error("블록 잠금에 실패했습니다.");

    // (b) pending 번역 선삽입 — 서버가 죽어도 고아 블록 불가
    const targetRole = oppositeRole(block.authorRole);
    sqlite
      .prepare(
        `INSERT INTO translations (block_id, target_role, status, created_at, attempt_at)
         VALUES (?, ?, 'pending', ?, ?)`
      )
      .run(blockId, targetRole, lockedAt, lockedAt);

    // (c) 새 블록 확정 → 양측 승인 해제 (반드시 트랜잭션 내부)
    sqlite
      .prepare(
        `UPDATE documents SET approval_planner_at = NULL, approval_developer_at = NULL
         WHERE id = ?`
      )
      .run(block.docId);

    return {
      blockId,
      docId: block.docId,
      sourceMd: block.sourceMd,
      targetRole,
    };
  });
  return tx(); // (d) 커밋
}

// ---------------------------------------------------------------------------
// 번역 결과 기록 / 재시도
// ---------------------------------------------------------------------------

/** 조건부 UPDATE(WHERE status='pending') — 비행 중 호출과 재시도의 경합 무해화 */
export function recordTranslation(
  blockId: number,
  result: { ok: true; md: string } | { ok: false; error: string }
): boolean {
  const updated = result.ok
    ? sqlite
        .prepare(
          `UPDATE translations SET status = 'ok', translated_md = ?
           WHERE block_id = ? AND status = 'pending'`
        )
        .run(result.md, blockId)
    : sqlite
        .prepare(
          `UPDATE translations SET status = 'failed'
           WHERE block_id = ? AND status = 'pending'`
        )
        .run(blockId);
  return updated.changes > 0;
}

/**
 * 재시도 준비: failed 또는 오래된 pending(2분 초과)만 pending으로 되돌리고
 * attempt_at을 갱신. 재시도가 허용되면 translate() 호출에 필요한 정보 반환.
 */
export function markTranslationRetry(blockId: number): SentBlock | null {
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const result = sqlite
    .prepare(
      `UPDATE translations SET status = 'pending', attempt_at = ?
       WHERE block_id = ?
         AND (status = 'failed'
              OR (status = 'pending' AND (attempt_at IS NULL OR attempt_at < ?)))`
    )
    .run(now(), blockId, staleBefore);
  if (result.changes === 0) return null;

  const row = sqlite
    .prepare(
      `SELECT b.id AS blockId, b.doc_id AS docId, b.source_md AS sourceMd,
              t.target_role AS targetRole
       FROM blocks b JOIN translations t ON t.block_id = b.id
       WHERE b.id = ?`
    )
    .get(blockId) as SentBlock | undefined;
  return row ?? null;
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
    .prepare("SELECT status FROM blocks WHERE id = ?")
    .get(blockId) as { status: string } | undefined;
  if (!block) throw new Error("블록을 찾을 수 없습니다.");
  if (block.status !== "locked")
    throw new Error("댓글은 잠긴 블록에만 작성할 수 있습니다.");
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
  const column =
    role === "planner" ? "approval_planner_at" : "approval_developer_at";
  sqlite
    .prepare(`UPDATE documents SET ${column} = ? WHERE id = ?`)
    .run(now(), docId);
  const doc = getDocument(docId);
  return Boolean(doc?.approvalPlannerAt && doc?.approvalDeveloperAt);
}
