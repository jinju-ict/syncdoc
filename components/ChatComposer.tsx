"use client";

/**
 * 채팅 입력창 (v0.2 채팅 렌즈) — 메신저형.
 * Enter = 보내기, Shift+Enter = 줄바꿈. 보내면 메시지(블록)가 즉시 잠기고
 * 멤버 (직군×언어)별 번역이 생성된다. 절은 지정하지 않는다(통합 타임라인) —
 * 어느 절에 기여하는지는 뒤에서 AI가 분류한다.
 */

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/repo";
import { sendBlock } from "@/app/doc/[id]/actions";

const L = {
  placeholder: {
    ko: "메시지를 입력하세요…  (Enter 전송 · Shift+Enter 줄바꿈)",
    en: "Type a message…  (Enter to send · Shift+Enter for newline)",
    ja: "メッセージを入力…  (Enter送信 · Shift+Enter改行)",
  },
  send: { ko: "보내기", en: "Send", ja: "送信" },
  sending: { ko: "전송 중…", en: "Sending…", ja: "送信中…" },
} as const;

export default function ChatComposer({
  docId,
  lang = "ko",
}: {
  docId: number;
  lang?: Lang;
}) {
  const [md, setMd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const tx = (k: keyof typeof L) => L[k][lang] ?? L[k].ko;

  const send = () => {
    const text = md.trim();
    if (text.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await sendBlock(docId, text, null);
      if (result.ok) {
        setMd("");
        taRef.current?.focus();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="sticky bottom-0 border-t border-[#E6E3DC] bg-[#F6F5F2]/90 pt-3 backdrop-blur">
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <div className="flex items-end gap-2 rounded-2xl border border-[#E0DCD2] bg-white p-2 focus-within:border-[#9DB0E8]">
        <textarea
          ref={taRef}
          value={md}
          onChange={(e) => setMd(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={tx("placeholder")}
          disabled={isPending}
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-6 text-gray-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={isPending || md.trim().length === 0}
          className="flex-shrink-0 rounded-xl bg-[#2D4FD4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2440b0] disabled:opacity-40"
        >
          {isPending ? tx("sending") : tx("send")}
        </button>
      </div>
    </div>
  );
}
