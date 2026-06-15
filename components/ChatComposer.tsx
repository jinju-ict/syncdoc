"use client";

/**
 * 채팅 입력창 (v0.2 채팅 렌즈) — 메신저형.
 * Enter = 보내기, Shift+Enter = 줄바꿈. 보내면 메시지(블록)가 즉시 잠기고
 * 멤버 (직군×언어)별 번역이 생성된다. 절은 지정하지 않는다(통합 타임라인).
 *
 * 추천 메시지(객관식): "추천" 버튼 → 지금 대화 + 내 직군 기준 후보 2~4개 →
 * 고르면 입력창에 채워지고(수정 가능) 사용자가 보낸다.
 */

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/repo";
import { sendBlock, requestReplySuggestions } from "@/app/doc/[id]/actions";

const L = {
  placeholder: {
    ko: "메시지를 입력하세요…  (Enter 전송 · Shift+Enter 줄바꿈)",
    en: "Type a message…  (Enter to send · Shift+Enter for newline)",
    ja: "メッセージを入力…  (Enter送信 · Shift+Enter改行)",
  },
  send: { ko: "보내기", en: "Send", ja: "送信" },
  sending: { ko: "전송 중…", en: "Sending…", ja: "送信中…" },
  recommend: { ko: "추천 메시지", en: "Suggest", ja: "おすすめ" },
  recommending: { ko: "생성 중…", en: "Thinking…", ja: "生成中…" },
  pickHint: {
    ko: "고르면 입력창에 채워집니다 — 수정 후 보내세요",
    en: "Pick one to fill the box — edit, then send",
    ja: "選ぶと入力欄に入ります — 編集して送信",
  },
  close: { ko: "닫기", en: "Close", ja: "閉じる" },
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
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
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
        setSuggestions(null);
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

  const recommend = async () => {
    setError(null);
    setSuggesting(true);
    try {
      const r = await requestReplySuggestions(docId);
      if (r.ok) setSuggestions(r.options);
      else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  };

  const pick = (option: string) => {
    setMd(option);
    setSuggestions(null);
    taRef.current?.focus();
  };

  return (
    <div className="sticky bottom-0 border-t border-[#E6E3DC] bg-[#F6F5F2]/90 pt-3 backdrop-blur">
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {/* 추천 메시지(객관식) */}
      {suggestions && suggestions.length > 0 && (
        <div className="mb-2 rounded-xl border border-[#C9D6F6] bg-[#F2F5FE] p-2.5">
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className="text-[11px] font-semibold text-[#2D4FD4]">✨ {tx("recommend")}</span>
            <span className="text-[11px] text-[#8A94B5]">{tx("pickHint")}</span>
            <button
              type="button"
              onClick={() => setSuggestions(null)}
              className="ml-auto text-[11px] text-gray-400 hover:text-gray-600"
            >
              {tx("close")}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {suggestions.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pick(opt)}
                className="rounded-lg border border-[#D7E0F8] bg-white px-3 py-2 text-left text-[13px] leading-6 text-[#34322C] hover:border-[#2D4FD4] hover:bg-[#FAFBFF]"
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-2xl border border-[#E0DCD2] bg-white p-2 focus-within:border-[#9DB0E8]">
        <button
          type="button"
          onClick={recommend}
          disabled={suggesting || isPending}
          title={tx("recommend")}
          className="flex-shrink-0 self-stretch rounded-xl border border-[#D7E0F8] bg-[#F2F5FE] px-2.5 text-[12px] font-semibold text-[#2D4FD4] hover:bg-[#E7EDFC] disabled:opacity-50"
        >
          {suggesting ? tx("recommending") : "✨"}
        </button>
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
