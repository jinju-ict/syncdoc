"use client";

/** 팀원 초대 — 이미 가입한 이메일이면 즉시 멤버, 아니면 대기 초대로 남는다 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { Lang, Permission, ProjectRole } from "@/lib/repo";
import { inviteAction } from "@/app/start/actions";
import { t, roleLabelL, permLabelL } from "@/lib/i18n";

const ROLE_KEYS: ProjectRole[] = ["planner", "developer", "designer", "ops"];
const PERM_KEYS: Permission[] = ["editor", "viewer", "link"];

function seg(active: boolean, pos: "l" | "m" | "r"): CSSProperties {
  return {
    fontFamily: "inherit",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 600,
    padding: "7px 0",
    border: "1px solid " + (active ? "#C9D6F6" : "#E0DCD2"),
    background: active ? "#EDF1FE" : "#fff",
    color: active ? "#2D4FD4" : "#6E6A60",
    borderRadius: pos === "l" ? "9px 0 0 9px" : pos === "r" ? "0 9px 9px 0" : "0",
    marginInlineStart: pos === "l" ? 0 : -1,
    flex: 1,
  };
}

export default function InviteForm({ projectId, lang = "ko" }: { projectId: number; lang?: Lang }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("developer");
  const [perm, setPerm] = useState<Permission>("editor");
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const send = () => {
    if (!email.trim()) { setMsg(t(lang, "mem.needEmail")); return; }
    startTransition(async () => {
      const r = await inviteAction({ projectId, email, role, perm });
      if (r.ok) {
        setMsg(r.data.added ? t(lang, "mem.added") : t(lang, "mem.sent"));
        setEmail("");
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  };

  return (
    <div>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t(lang, "mem.email")}
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid #E0DCD2", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", outlineColor: "#2D4FD4" }}
      />
      <p style={{ fontSize: 11, fontWeight: 600, color: "#9A958A", margin: "14px 0 6px" }}>{t(lang, "mem.role")}</p>
      <div style={{ display: "flex" }}>
        {ROLE_KEYS.map((r, i, a) => (
          <button key={r} onClick={() => setRole(r)} style={seg(role === r, i === 0 ? "l" : i === a.length - 1 ? "r" : "m")}>
            {roleLabelL(r, lang)}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#9A958A", margin: "14px 0 6px" }}>{t(lang, "mem.perm")}</p>
      <div style={{ display: "flex" }}>
        {PERM_KEYS.map((id, i, a) => (
          <button key={id} onClick={() => setPerm(id)} style={seg(perm === id, i === 0 ? "l" : i === a.length - 1 ? "r" : "m")}>
            {permLabelL(id, lang)}
          </button>
        ))}
      </div>
      <button
        onClick={send}
        disabled={isPending}
        style={{ width: "100%", background: "#2D4FD4", color: "#fff", border: 0, borderRadius: 11, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 0 #1F3680", marginTop: 16, opacity: isPending ? 0.7 : 1 }}
      >
        {t(lang, "mem.send")}
      </button>
      {msg && <p style={{ fontSize: 12, color: "#6E6A60", margin: "8px 0 0", textAlign: "center" }}>{msg}</p>}
    </div>
  );
}
