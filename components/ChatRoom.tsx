"use client";

/**
 * 채팅방 (v0.2 채팅 렌즈) — 통합 타임라인. 프로젝트당 하나의 공용 방.
 * 메시지(잠긴 블록)를 날짜별로 묶어 버블로 보여주고, 하단 입력창으로 보낸다.
 * 대화 = 입력, 백서 = 출력 — 어느 절에 기여하는지는 뒤에서 AI가 분류한다.
 */

import type { Lang, MemberInfo, MessageRelevanceView, ProjectRole, TimelineBlock } from "@/lib/repo";
import { roleLabelL } from "@/lib/i18n";
import ChatMessage from "./ChatMessage";
import ChatComposer from "./ChatComposer";

const L = {
  empty: {
    ko: "아직 대화가 없습니다. 첫 메시지를 보내 백서를 시작하세요.",
    en: "No messages yet. Send the first one to start the whitepaper.",
    ja: "まだ会話がありません。最初のメッセージを送って白書を始めましょう。",
  },
  readOnly: {
    ko: "이 문서는 보관됨 · 읽기 전용입니다.",
    en: "This document is archived · read-only.",
    ja: "この文書はアーカイブ済み · 読み取り専用です。",
  },
} as const;

function dayOf(ts: string): string {
  return ts.slice(0, 10);
}

export default function ChatRoom({
  blocks,
  members,
  relevances = [],
  canCurate = false,
  viewerId,
  viewerRole,
  viewerLang = "ko",
  docId,
  readOnly = false,
}: {
  blocks: TimelineBlock[];
  members: MemberInfo[];
  relevances?: MessageRelevanceView[];
  canCurate?: boolean;
  viewerId: number;
  viewerRole: ProjectRole;
  viewerLang?: Lang;
  docId: number;
  readOnly?: boolean;
}) {
  const tx = (k: keyof typeof L) => L[k][viewerLang] ?? L[k].ko;
  const nameById = new Map(members.map((m) => [m.userId, m.name]));
  const relById = new Map(relevances.map((r) => [r.messageId, r]));
  const nameOf = (b: TimelineBlock) =>
    nameById.get(b.authorId) ?? roleLabelL(b.authorRole, viewerLang);

  let lastDay = "";

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[760px] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        {blocks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#DAD5C8] bg-[#FAF9F5] px-6 py-12 text-center text-sm text-[#9A958A]">
            {tx("empty")}
          </div>
        ) : (
          blocks.map((b) => {
            const day = dayOf(b.lockedAt);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={b.id} className="space-y-4">
                {showDay && (
                  <div className="flex items-center justify-center">
                    <span className="rounded-full bg-[#ECE9E1] px-3 py-0.5 text-[11px] font-medium text-[#8A857A]">
                      {day}
                    </span>
                  </div>
                )}
                <ChatMessage
                  block={b}
                  relevance={relById.get(b.id) ?? null}
                  canCurate={canCurate && !readOnly}
                  viewerId={viewerId}
                  viewerRole={viewerRole}
                  viewerLang={viewerLang}
                  docId={docId}
                  authorName={nameOf(b)}
                  readOnly={readOnly}
                />
              </div>
            );
          })
        )}
      </div>

      {readOnly ? (
        <p className="mt-2 rounded-xl border border-[#E0DCD2] bg-[#F0EEE7] px-4 py-3 text-center text-sm text-[#6E6A60]">
          {tx("readOnly")}
        </p>
      ) : (
        <ChatComposer docId={docId} lang={viewerLang} />
      )}
    </div>
  );
}
