"use client";

/**
 * 절 증류 버튼 — 그 절의 대화를 백서 산문으로 증류(1회). 캐시되면 AI 재호출 없음.
 * state: none(대화 없음) / stale(증류 필요) / fresh(이미 최신)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { distillSectionAction } from "@/app/doc/[id]/actions";
import type { Lang } from "@/lib/repo";
import { t } from "@/lib/i18n";

export default function DistillButton({
  docId,
  sectionKey,
  state,
  lang = "ko",
}: {
  docId: number;
  sectionKey: string;
  state: "none" | "stale" | "fresh";
  lang?: Lang;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  if (state === "none") {
    return (
      <span style={{ fontSize: 11.5, color: "#A8A296" }}>
        {t(lang, "distillNone")}
      </span>
    );
  }

  const fresh = state === "fresh";
  const run = () =>
    startTransition(async () => {
      setMsg(null);
      const r = await distillSectionAction(docId, sectionKey);
      if (r.ok) {
        setMsg(r.cached ? t(lang, "distillCached") : t(lang, "distillDone"));
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {msg && <span style={{ fontSize: 11.5, color: "#6E6A60" }}>{msg}</span>}
      <button
        type="button"
        onClick={run}
        disabled={fresh || isPending}
        title={fresh ? "현재 대화 기준 최신 상태입니다" : "이 절의 대화를 백서에 반영합니다"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: fresh ? "#F2FAF5" : "#2D4FD4",
          color: fresh ? "#1B7F45" : "#fff",
          border: fresh ? "1px solid #D3EBDC" : "0",
          borderRadius: 9,
          padding: "7px 13px",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: fresh || isPending ? "default" : "pointer",
          fontFamily: "inherit",
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {fresh ? t(lang, "distilled") : isPending ? t(lang, "distilling") : t(lang, "distill")}
      </button>
    </span>
  );
}
