import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** 문서 번역·합의 코어의 2축 역할 (엔진 고정) */
export type Role = "planner" | "developer";
/** 프로젝트 멤버십 직군 (화면·멤버십 표시용 4직군). 번역 코어로는 Role 2축에 매핑된다. */
export type ProjectRole = "planner" | "developer" | "designer" | "ops";
/** 프로젝트 권한 — viewer는 초대된 제한 뷰어, link는 링크 공유 뷰어 */
export type Permission = "owner" | "editor" | "viewer" | "link";
/** 초대 수명주기 */
export type InviteStatus = "pending" | "accepted" | "declined";
/** 입장 요청 수명주기 (사용자→소유자 방향, invites와 반대) */
export type JoinRequestStatus = "pending" | "approved" | "rejected";
/** 채팅 첨부 종류 — 업로드 파일 / 외부 링크 */
export type AttachmentKind = "file" | "link";
export type BlockStatus = "draft" | "locked";
export type TranslationStatus = "pending" | "ok" | "failed";
/** 사용자 숙련도 — 번역이 독자의 배경지식 수준에 맞춰 표현을 조절한다 */
export type ExpertiseLevel = "beginner" | "intermediate" | "expert";
/** 사용자 자연어 — 콘텐츠가 이 언어로 번역되어 보인다 (정본 원문은 한국어) */
export type Lang = "ko" | "en" | "ja";
export const LANGS: readonly Lang[] = ["ko", "en", "ja"];
/** 문서 수명주기 — archived는 문서 전체 읽기 전용 (삭제 기능은 없다 — 내용 추적 보장) */
export type DocumentStatus = "active" | "archived";
/** 프로젝트 내 문서 종류 — 본문(백서) / 회의록 / 릴리스 */
export type DocKind = "main" | "meeting" | "release";

export const DOC_KINDS: readonly DocKind[] = ["main", "meeting", "release"];

export const PROJECT_ROLES: readonly ProjectRole[] = [
  "planner",
  "developer",
  "designer",
  "ops",
];
export const PERMISSIONS: readonly Permission[] = [
  "owner",
  "editor",
  "viewer",
  "link",
];

/**
 * 멤버십 직군(4) → 번역·합의 코어 역할(2) 매핑.
 * 기획은 기획 측, 그 외(개발/디자인/운영)는 개발 측으로 본다.
 * (향후 N직군 번역 엔진으로 확장 시 이 매핑을 제거한다)
 */
export function toCoreRole(role: ProjectRole): Role {
  return role === "planner" ? "planner" : "developer";
}

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  // 이메일 가입 계정용 (기존 시드 계정은 NULL일 수 있음)
  email: text("email").unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  // 전역 역할은 멤버십이 없을 때의 폴백일 뿐 — 권위는 project_members.role
  role: text("role", { enum: ["planner", "developer"] }).notNull(),
  level: text("level", { enum: ["beginner", "intermediate", "expert"] })
    .notNull()
    .default("intermediate"),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  // 디자인 결정: 타입은 'project' 하나로 고정 (회의록·릴리스는 그 안의 산물)
  type: text("type").notNull().default("project"),
  linkShared: integer("link_shared").notNull().default(0),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const projectMembers = sqliteTable("project_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role", {
    enum: ["planner", "developer", "designer", "ops"],
  }).notNull(),
  perm: text("perm", { enum: ["owner", "editor", "viewer", "link"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const invites = sqliteTable("invites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  email: text("email").notNull(),
  role: text("role", {
    enum: ["planner", "developer", "designer", "ops"],
  }).notNull(),
  perm: text("perm", { enum: ["owner", "editor", "viewer", "link"] }).notNull(),
  invitedBy: integer("invited_by")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: ["pending", "accepted", "declined"] })
    .notNull()
    .default("pending"),
  createdAt: text("created_at").notNull(),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  // 소속 프로젝트 (레거시 문서는 NULL)
  projectId: integer("project_id").references(() => projects.id),
  // 프로젝트 내 종류 — main(백서) / meeting(회의록) / release(릴리스)
  kind: text("kind", { enum: ["main", "meeting", "release"] })
    .notNull()
    .default("main"),
  approvalPlannerAt: text("approval_planner_at"),
  approvalDeveloperAt: text("approval_developer_at"),
  status: text("status", { enum: ["active", "archived"] })
    .notNull()
    .default("active"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at"),
});

export const blocks = sqliteTable("blocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id")
    .notNull()
    .references(() => documents.id),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  authorRole: text("author_role", { enum: ["planner", "developer"] }).notNull(),
  sourceMd: text("source_md").notNull(),
  status: text("status", { enum: ["draft", "locked"] })
    .notNull()
    .default("draft"),
  lockedAt: text("locked_at"),
  versionTag: text("version_tag"),
  seq: integer("seq"),
});

export const translations = sqliteTable("translations", {
  blockId: integer("block_id")
    .primaryKey()
    .references(() => blocks.id),
  targetRole: text("target_role", { enum: ["planner", "developer"] }).notNull(),
  translatedMd: text("translated_md"),
  status: text("status", { enum: ["pending", "ok", "failed"] })
    .notNull()
    .default("pending"),
  createdAt: text("created_at").notNull(),
  attemptAt: text("attempt_at"),
});

export const suggestions = sqliteTable("suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  blockId: integer("block_id")
    .notNull()
    .references(() => blocks.id),
  optionsJson: text("options_json").notNull(),
  acceptedOption: integer("accepted_option"),
  createdAt: text("created_at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  blockId: integer("block_id")
    .notNull()
    .references(() => blocks.id),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  parentId: integer("parent_id"),
  createdAt: text("created_at").notNull(),
});

/**
 * 멤버별 합의 서명 — "내 직군·내 언어로 렌더링된 버전을 읽고 동의했다"는 기록.
 * 합의 게이트(abstracts 생성)는 여전히 역할 측(approval_*_at)으로 판정하지만,
 * 동일 직군 다중 사용자 협업에서 누가 동의했는지를 1인1서명으로 남긴다.
 * 새 블록 '보내기' 시 문서 합의가 해제되므로 서명도 함께 비워진다.
 */
export const signatures = sqliteTable("signatures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id")
    .notNull()
    .references(() => documents.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role", {
    enum: ["planner", "developer", "designer", "ops"],
  }).notNull(),
  signedAt: text("signed_at").notNull(),
});

export const abstracts = sqliteTable("abstracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id")
    .notNull()
    .references(() => documents.id),
  abstractMd: text("abstract_md").notNull(),
  tocMd: text("toc_md").notNull(),
  generatedAt: text("generated_at").notNull(),
});

/**
 * v0.2 채팅 기반 백서: 메시지(blocks)별 관련도·절 분류.
 * AI가 ai_* 컬럼을 채우고, 사람은 pinned/excluded/override_section_key로 교정한다.
 */
export const messageRelevance = sqliteTable("message_relevance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id")
    .notNull()
    .references(() => blocks.id),
  aiSectionKey: text("ai_section_key"),
  aiRelevance: integer("ai_relevance"),
  aiReason: text("ai_reason"),
  pinned: integer("pinned").notNull().default(0),
  excluded: integer("excluded").notNull().default(0),
  overrideSectionKey: text("override_section_key"),
  classifiedAt: text("classified_at"),
  updatedAt: text("updated_at"),
});

/** v0.2 채팅 첨부 — 파일/링크. 텍스트·링크는 AI가 읽어 백서 근거로 사용. */
export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id")
    .notNull()
    .references(() => documents.id),
  messageId: integer("message_id").references(() => blocks.id),
  kind: text("kind", { enum: ["file", "link"] }).notNull(),
  url: text("url"),
  path: text("path"),
  mime: text("mime"),
  title: text("title"),
  textExcerpt: text("text_excerpt"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: text("created_at").notNull(),
});

/** v0.2 입장 승인 — 사용자→소유자 방향의 입장 요청 (invites와 반대 방향). */
export const joinRequests = sqliteTable("join_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  requestedRole: text("requested_role", {
    enum: ["planner", "developer", "designer", "ops"],
  }).notNull(),
  message: text("message"),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  createdAt: text("created_at").notNull(),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: text("decided_at"),
});
