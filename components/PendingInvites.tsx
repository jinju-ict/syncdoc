"use client";

/** 대기 중 초대 (소유자) — 취소 가능 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang, ProjectInvite } from "@/lib/repo";
import { revokeInviteAction } from "@/app/project/[id]/actions";
import { t, roleLabelL } from "@/lib/i18n";

export default function PendingInvites({
  projectId,
  invites,
  lang = "ko",
}: {
  projectId: number;
  invites: ProjectInvite[];
  lang?: Lang;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (invites.length === 0) return null;

  const revoke = (inviteId: number) =>
    startTransition(async () => {
      const r = await revokeInviteAction({ projectId, inviteId });
      if (!r.ok) alert(r.error);
      router.refresh();
    });

  return (
    <div style={{ background: "#fff", border: "1px solid #E9E6DE", borderRadius: 16, padding: "18px 20px" }}>
      <p style={{ fontSize: 13.5, fontWeight: 700, margin: "0 0 12px" }}>
        {t(lang, "pj.pending")} <span style={{ color: "#9A958A", fontWeight: 600 }}>{invites.length}</span>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {invites.map((iv) => (
          <div key={iv.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, fontFamily: "var(--font-jetbrains), monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iv.email}</span>
              <span style={{ display: "block", fontSize: 11, color: "#9A958A", marginTop: 1 }}>{roleLabelL(iv.role, lang)}</span>
            </span>
            <button
              type="button"
              onClick={() => revoke(iv.id)}
              disabled={isPending}
              style={{ marginInlineStart: "auto", flexShrink: 0, background: "#fff", border: "1px solid #E0DCD2", borderRadius: 8, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, color: "#9A958A", cursor: "pointer", fontFamily: "inherit" }}
            >
              {t(lang, "pj.cancel")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
