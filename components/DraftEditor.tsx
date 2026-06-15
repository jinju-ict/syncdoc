"use client";

/**
 * 초안 에디터 — 마크다운 textarea + 임시 저장 + '보내기'(잠금+번역 트리거)
 * + AI 개선 제안 패널(객관식, 비차단).
 *
 * draft는 작성자 본인에게만 보인다 (서버 조회 계층에서 강제).
 *
 * AI 제안 플로우: 'AI 제안 받기'(보내기와 독립) → 옵션 카드 렌더 →
 * '초안에 반영' 클릭 시 해당 텍스트를 textarea에 병합(setMd) →
 * 작성자가 자유 수정 후 일반 보내기 플로우로 확정.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProjectRole } from "@/lib/repo";
import {
  saveDraft,
  sendBlock,
  requestSuggestions,
} from "@/app/doc/[id]/actions";

const roleLabel: Record<ProjectRole, string> = {
  planner: "기획팀",
  developer: "개발팀",
  designer: "디자인팀",
  ops: "운영팀",
};

export default function DraftEditor({
  docId,
  draft,
  viewerRole,
  sectionKey = null,
  sectionLabel = null,
}: {
  docId: number;
  draft: { id: number; sourceMd: string } | null;
  viewerRole: ProjectRole;
  /** 이 초안이 속한 백서 절 (나란히 렌즈). null = 전체/대화 렌즈 */
  sectionKey?: string | null;
  sectionLabel?: string | null;
}) {
  const [md, setMd] = useState(draft?.sourceMd ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // --- AI 제안 상태 (보내기와 독립 — 비차단) ---
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [appliedOptions, setAppliedOptions] = useState<Set<number>>(new Set());
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      await saveDraft(docId, md, sectionKey);
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
      const result = await sendBlock(docId, md, sectionKey);
      if (result.ok) {
        setMd("");
        setSavedAt(null);
        setSuggestions(null);
        setAppliedOptions(new Set());
        setSuggestError(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const handleRequestSuggestions = async () => {
    setSuggestError(null);
    if (md.trim().length === 0) {
      setSuggestError("초안을 먼저 작성하세요.");
      return;
    }
    setSuggestLoading(true);
    try {
      const result = await requestSuggestions(docId, md, sectionKey);
      if (result.ok) {
        setSuggestions(result.options);
        setAppliedOptions(new Set());
      } else {
        setSuggestError(result.error);
      }
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggestLoading(false);
    }
  };

  /** 선택한 옵션 텍스트를 초안에 병합 — 작성자는 이후 자유롭게 수정 가능 */
  const handleApplyOption = (index: number, option: string) => {
    if (appliedOptions.has(index)) return;
    setMd((prev) =>
      prev.trim().length === 0 ? option : `${prev.trimEnd()}\n\n${option}`
    );
    setAppliedOptions((prev) => new Set(prev).add(index));
  };

  return (
    <section className="rounded-lg border border-gray-300 bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-sm font-medium text-gray-700">
          새 블록 초안 ({roleLabel[viewerRole]})
          {sectionLabel && <span className="text-gray-400"> · {sectionLabel}</span>}
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

        {/* --- AI 개선 제안 패널 (객관식, 비차단) --- */}
        <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-indigo-700">
              AI 개선 제안
            </span>
            <div className="flex items-center gap-2">
              {suggestions && (
                <button
                  type="button"
                  onClick={() => {
                    setSuggestions(null);
                    setAppliedOptions(new Set());
                    setSuggestError(null);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  닫기
                </button>
              )}
              <button
                type="button"
                onClick={handleRequestSuggestions}
                disabled={suggestLoading}
                className="rounded-md border border-indigo-300 bg-white px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {suggestLoading
                  ? "제안 생성 중…"
                  : suggestions
                    ? "다시 제안 받기"
                    : "AI 제안 받기"}
              </button>
            </div>
          </div>

          {suggestError && (
            <p className="mt-2 text-xs text-red-600">{suggestError}</p>
          )}

          {suggestions && (
            <ul className="mt-2 space-y-2">
              {suggestions.map((option, i) => {
                const applied = appliedOptions.has(i);
                return (
                  <li
                    key={i}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      applied
                        ? "border-green-200 bg-green-50 text-gray-500"
                        : "border-gray-200 bg-white text-gray-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="whitespace-pre-wrap">{option}</span>
                      <button
                        type="button"
                        onClick={() => handleApplyOption(i, option)}
                        disabled={applied}
                        className="shrink-0 rounded border border-indigo-200 bg-white px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-50 disabled:cursor-default disabled:border-green-200 disabled:text-green-700"
                      >
                        {applied ? "반영됨 ✓" : "초안에 반영"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {suggestions && (
            <p className="mt-2 text-[11px] text-gray-400">
              반영된 제안은 초안 텍스트에 추가됩니다. 자유롭게 수정한 뒤
              보내기를 누르세요.
            </p>
          )}
        </div>

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
