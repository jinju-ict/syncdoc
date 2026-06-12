import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export type Role = "planner" | "developer";
export type BlockStatus = "draft" | "locked";
export type TranslationStatus = "pending" | "ok" | "failed";
/** 사용자 숙련도 — 번역이 독자의 배경지식 수준에 맞춰 표현을 조절한다 */
export type ExpertiseLevel = "beginner" | "intermediate" | "expert";
/** 문서 수명주기 — archived는 문서 전체 읽기 전용 (삭제 기능은 없다 — 내용 추적 보장) */
export type DocumentStatus = "active" | "archived";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["planner", "developer"] }).notNull(),
  level: text("level", { enum: ["beginner", "intermediate", "expert"] })
    .notNull()
    .default("intermediate"),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
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

export const abstracts = sqliteTable("abstracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  docId: integer("doc_id")
    .notNull()
    .references(() => documents.id),
  abstractMd: text("abstract_md").notNull(),
  tocMd: text("toc_md").notNull(),
  generatedAt: text("generated_at").notNull(),
});
