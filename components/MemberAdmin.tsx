"use client";

/**
 * 팀원 관리 — 소유자는 직군·권한 변경, 제거 가능. 비소유자는 읽기 전용.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { Lang, MemberInfo, Permission, ProjectRole } from "@/lib/repo";
import { removeMemberAction, updateMemberAction } from "@/app/project/[id]/actions";
import { t, roleLabelL, permLabelL } from "@/lib/i18n";

const ROLE_COLOR: Record<ProjectRole, { c: string; bg: string }> = {
  planner: { c: "#6D4FC8", bg: "#F1EDFB" },
  developer: { c: "#0D7E74", bg: "#E6F4F2" },
  designer: { c: "#C2410C", bg: "#FBEEE4" },
  ops: { c: "#2D6FB0", bg: "#E7F0F8" },
};
const ROLE_KEYS: ProjectRole[] = ["planner", "developer", "designer", "ops"];
const PERM_KEYS: Permission[] = ["owner", "editor", "viewer", "link"];

const selStyle: CSSProperties = {
  border: "1px solid #E0DCD2",
  borderRadius: 8,
  padding: "4px 6px",
  fontSize: 12,
  fontWeight: 600,
  color: "#3C3A34",
  background: "#fff",
  fontFamily: "inherit",
  cursor: "pointer",
};

export default function MemberAdmin({
  projectId,
  members,
  isOwner,
  currentUserId,
  lang = "ko",
}: {
  projectId: number;
  members: MemberInfo[];
  isOwner: boolean;
  currentUserId: number;
  lang?: Lang;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const change = (userId: number, role: ProjectRole, perm: Permission) =>
    startTransition(async () => {
      const r = await updateMemberAction({ projectId, userId, role, perm });
      if (!r.ok) alert(r.error);
      router.refresh();
    });

  const remove = (userId: number, name: string) => {
    if (!window.confirm(`${name}${t(lang, "mem.removeConfirm")}`)) return;
    startTransition(async () => {
      const r = await removeMemberAction({ projectId, userId });
      if (!r.ok) alert(r.error);
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {members.map((m) => (
        <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, background: ROLE_COLOR[m.role].bg, color: ROLE_COLOR[m.role].c }}>
            {(m.name || m.email).trim().charAt(0)}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 }}>
              {m.name}
              {m.userId === currentUserId && <span style={{ color: "#9A958A", fontWeight: 400 }}> {t(lang, "mem.me")}</span>}
            </span>
            <span style={{ display: "block", fontSize: 11, color: "#9A958A", fontFamily: "var(--font-jetbrains), monospace" }}>{m.email}</span>
          </span>
          <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {isOwner ? (
              <>
                <select
                  value={m.role}
                  disabled={isPending}
                  onChange={(e) => change(m.userId, e.target.value as ProjectRole, m.perm)}
                  style={selStyle}
                >
                  {ROLE_KEYS.map((r) => (
                    <option key={r} value={r}>{roleLabelL(r, lang)}</option>
                  ))}
                </select>
                <select
                  value={m.perm}
                  disabled={isPending}
                  onChange={(e) => change(m.userId, m.role, e.target.value as Permission)}
                  style={selStyle}
                >
                  {PERM_KEYS.map((p) => (
                    <option key={p} value={p}>{permLabelL(p, lang)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(m.userId, m.name)}
                  disabled={isPending}
                  title={t(lang, "pj.cancel")}
                  style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, border: "1px solid #E0DCD2", background: "#fff", cursor: "pointer", color: "#9A958A" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600, borderRadius: 99, padding: "2px 9px", color: ROLE_COLOR[m.role].c, background: ROLE_COLOR[m.role].bg, border: `1px solid ${ROLE_COLOR[m.role].c}33` }}>
                  {roleLabelL(m.role, lang)}
                </span>
                <span style={{ fontSize: 11.5, color: "#8A857A" }}>{permLabelL(m.perm, lang)}</span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
