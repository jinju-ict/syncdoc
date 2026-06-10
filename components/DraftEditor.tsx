"use client";

/**
 * 초안 에디터 — 마크다운 textarea + 임시 저장 + '보내기'(잠금+번역 트리거).
 * draft는 작성자 본인에게만 보인다 (서버 조회 계층에서 강제).
 *
 * NOTE(worker-ai): AI 개선 제안 패널은 아래 [AI-SUGGEST-PANEL-SLOT] 위치에
 * 추가할 것 — 객관식 옵션 제시 → 수락 시 setMd로 초안 반영 → 보내기.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/repo";
import { saveDraft, sendBlock } from "@/app/doc/[id]/actions";

const roleLabel: Record<Role, string> = {
  planner: "기획팀",
  developer: "개발팀",
};

export default function DraftEditor({
  docId,
  draft,
  viewerRole,
}: {
  docId: number;
  draft: { id: number; sourceMd: string } | null;
  viewerRole: Role;
}) {
  const [md, setMd] = useState(draft?.sourceMd ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      await saveDraft(docId, md);
      setSavedAt(new Date().toLocaleTimeString());
    });
  };

  const handleSend = () => {
    setError(null);
    if (md.trim().length === 0) {
      setError("빈 초안은 보낼 수 없습니다.");
      return;
    }
    startTransition(async () => {
      const result = await sendBlock(docId, md);
      if (result.ok) {
        setMd("");
        setSavedAt(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <section className="rounded-lg border border-gray-300 bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-sm font-medium text-gray-700">
          새 블록 초안 ({roleLabel[viewerRole]})
        </span>
        <span className="text-xs text-gray-400">
          보내기 전까지 상대에게 보이지 않습니다
        </span>
      </header>

      <div className="p-4">
        <textarea
          value={md}
          onChange={(e) => setMd(e.target.value)}
          rows={8}
          placeholder="마크다운으로 작성하세요…"
          className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          disabled={isPending}
        />

        {/* [AI-SUGGEST-PANEL-SLOT]
            worker-ai: AI 개선 제안 패널(객관식)을 여기에 추가.
            suggest(md) 호출 → 옵션 렌더 → 수락 시 setMd(반영된 초안). */}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {savedAt ? `임시 저장됨 · ${savedAt}` : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              임시 저장
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isPending}
              className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {isPending ? "처리 중…" : "보내기"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          보내기를 누르면 블록이 즉시 잠기고 상대 직군용 번역이 생성됩니다.
          잠긴 블록은 수정·삭제할 수 없습니다.
        </p>
      </div>
    </section>
  );
}
