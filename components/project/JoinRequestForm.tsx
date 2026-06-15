"use client";

/** 비멤버 입장 요청 화면 — 직군 선택 + 메시지로 입장을 요청한다 (소유자 승인 대기). */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang, ProjectRole, JoinRequestStatus } from "@/lib/repo";
import { requestJoinAction } from "@/app/project/[id]/actions";
import { t, roleLabelL } from "@/lib/i18n";

const ROLES: readonly ProjectRole[] = ["planner", "developer", "designer", "ops"];

export default function JoinRequestForm({
  projectId,
  myStatus,
  lang = "ko",
}: {
  projectId: number;
  myStatus: JoinRequestStatus | null;
  lang?: Lang;
}) {
  const [role, setRole] = useState<ProjectRole>("planner");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(myStatus === "pending");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () =>
    startTransition(async () => {
      const r = await requestJoinAction({ projectId, role, message });
      if (!r.ok) {
        alert(r.error);
        return;
      }
      setSent(true);
      router.refresh();
    });

  if (sent) {
    return (
      <p style={{ fontSize: 13.5, color: "#0D7E74", background: "#E6F4F2", border: "1px solid #BFE6E0", borderRadius: 10, padding: "12px 14px", margin: 0 }}>
        {t(lang, "join.pendingMine")}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {myStatus === "rejected" && (
        <p style={{ fontSize: 12.5, color: "#A1462F", background: "#FBEDE8", border: "1px solid #F0D6CC", borderRadius: 10, padding: "10px 12px", margin: 0 }}>
          {t(lang, "join.rejectedMine")}
        </p>
      )}
      <label style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6E6A60", marginBottom: 6 }}>{t(lang, "mem.role")}</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ProjectRole)}
          style={{ width: "100%", border: "1px solid #E0DCD2", borderRadius: 9, padding: "9px 11px", fontSize: 13.5, fontFamily: "inherit", background: "#fff" }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{roleLabelL(r, lang)}</option>
          ))}
        </select>
      </label>
      <label style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6E6A60", marginBottom: 6 }}>{t(lang, "join.message")}</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t(lang, "join.messagePh")}
          rows={3}
          style={{ width: "100%", border: "1px solid #E0DCD2", borderRadius: 9, padding: "9px 11px", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        style={{ background: "#2D4FD4", border: "1px solid #2D4FD4", borderRadius: 10, padding: "10px 0", fontSize: 13.5, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit", opacity: isPending ? 0.6 : 1 }}
      >
        {t(lang, "join.submit")}
      </button>
    </div>
  );
}
