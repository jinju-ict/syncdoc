"use client";

/** 대기 중 입장 요청 (소유자) — 승인/거절 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang, JoinRequestInfo } from "@/lib/repo";
import { approveJoinAction, rejectJoinAction } from "@/app/project/[id]/actions";
import { t, roleLabelL } from "@/lib/i18n";

export default function JoinRequests({
  projectId,
  requests,
  lang = "ko",
}: {
  projectId: number;
  requests: JoinRequestInfo[];
  lang?: Lang;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (requests.length === 0) return null;

  const act = (
    fn: (input: { projectId: number; requestId: number }) => Promise<
      { ok: true } | { ok: false; error: string }
    >,
    requestId: number
  ) =>
    startTransition(async () => {
      const r = await fn({ projectId, requestId });
      if (!r.ok) alert(r.error);
      router.refresh();
    });

  return (
    <div style={{ background: "#fff", border: "1px solid #E9E6DE", borderRadius: 16, padding: "18px 20px" }}>
      <p style={{ fontSize: 13.5, fontWeight: 700, margin: "0 0 12px" }}>
        {t(lang, "join.requests")} <span style={{ color: "#9A958A", fontWeight: 600 }}>{requests.length}</span>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {requests.map((jr) => (
          <div key={jr.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>
                {jr.name}
                <span style={{ marginInlineStart: 6, fontSize: 11, fontWeight: 600, color: "#9A958A" }}>{roleLabelL(jr.requestedRole, lang)}</span>
              </span>
              {jr.email && (
                <span style={{ display: "block", fontSize: 11, color: "#B0AB9F", fontFamily: "var(--font-jetbrains), monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jr.email}</span>
              )}
              {jr.message && (
                <span style={{ display: "block", fontSize: 12, color: "#6E6A60", marginTop: 3, wordBreak: "keep-all" }}>{jr.message}</span>
              )}
            </span>
            <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => act(approveJoinAction, jr.id)}
                disabled={isPending}
                style={{ background: "#2D4FD4", border: "1px solid #2D4FD4", borderRadius: 8, padding: "4px 12px", fontSize: 11.5, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
              >
                {t(lang, "join.approve")}
              </button>
              <button
                type="button"
                onClick={() => act(rejectJoinAction, jr.id)}
                disabled={isPending}
                style={{ background: "#fff", border: "1px solid #E0DCD2", borderRadius: 8, padding: "4px 12px", fontSize: 11.5, fontWeight: 600, color: "#9A958A", cursor: "pointer", fontFamily: "inherit" }}
              >
                {t(lang, "join.reject")}
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
