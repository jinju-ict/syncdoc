"use client";

/**
 * 잠긴 블록 렌더 (회색 배경 + 버전 태그 = 읽기전용 시각 처리).
 * - 내 직군 블록: 원문 그대로 표시
 * - 상대 직군 블록: 번역본(pending/ok/failed 상태별) + 원문 패널(기본 펼침, 접기 가능)
 *   — 원문과 번역본을 항상 함께 대조할 수 있게 한다. 번역 실패 시에는 본문이
 *   이미 원문이므로 원문 패널은 생략한다.
 *
 * NOTE(worker-ai): 번역 상태 UI를 다듬을 때 이 파일만 수정하면 된다.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role, TimelineBlock } from "@/lib/repo";
import { retryTranslation } from "@/app/doc/[id]/actions";
import Markdown from "./Markdown";

const roleLabel: Record<Role, string> = {
  planner: "기획팀",
  developer: "개발팀",
};

export default function BlockView({
  block,
  viewerRole,
  docId,
}: {
  block: TimelineBlock;
  viewerRole: Role;
  docId: number;
}) {
  // 원문 패널 기본 펼침 — 번역본과 원문을 같이 본다 (접기는 사용자 선택)
  const [showSource, setShowSource] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isOwnRole = block.authorRole === viewerRole;
  const translation = block.translation;
  // pending 행은 잠금 트랜잭션에서 선삽입되므로 항상 존재해야 하지만,
  // 만약 행이 없으면 failed로 취급(원문 + 재시도)해 히스토리를 막지 않는다.
  const translationStatus = translation?.status ?? "failed";

  const handleRetry = () => {
    startTransition(async () => {
      await retryTranslation(docId, block.id);
      router.refresh();
    });
  };

  return (
    <article className="rounded-lg border border-gray-200 bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="font-mono text-xs text-gray-500">
          {block.versionTag}
        </span>
        <span className="flex items-center gap-2 text-xs text-gray-400">
          {!isOwnRole && <TranslationBadge status={translationStatus} />}
          {roleLabel[block.authorRole]} 작성 · 잠김
        </span>
      </header>

      <div className="px-4 py-3">
        {isOwnRole ? (
          // 내 직군 블록 → 원문 그대로
          <Markdown>{block.sourceMd}</Markdown>
        ) : (
          // 상대 직군 블록 → 번역본 (상태별 표시)
          <TranslatedBody
            status={translationStatus}
            translatedMd={translation?.translatedMd ?? null}
            sourceMd={block.sourceMd}
            onRetry={handleRetry}
            retrying={isPending}
          />
        )}
      </div>

      {/* 원문 패널 — failed는 본문이 이미 원문이므로 생략 */}
      {!isOwnRole && translationStatus !== "failed" && (
        <footer className="border-t border-gray-200 px-4 py-2">
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            className="text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
          >
            {showSource ? "원문 접기" : "원문 보기"}
          </button>
          {showSource && (
            <div className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                원문 ({roleLabel[block.authorRole]})
              </p>
              <Markdown>{block.sourceMd}</Markdown>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}

/** 헤더용 번역 상태 배지 — 세 상태(pending/ok/failed)를 한눈에 구분 */
function TranslationBadge({
  status,
}: {
  status: "pending" | "ok" | "failed";
}) {
  if (status === "pending") {
    return (
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
        <span className="mr-1 inline-block animate-pulse">●</span>번역 중…
      </span>
    );
  }
  if (status === "ok") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
        AI 번역본
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
      번역 실패
    </span>
  );
}

function TranslatedBody({
  status,
  translatedMd,
  sourceMd,
  onRetry,
  retrying,
}: {
  status: "pending" | "ok" | "failed";
  translatedMd: string | null;
  sourceMd: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (status === "ok" && translatedMd) {
    return <Markdown>{translatedMd}</Markdown>;
  }

  if (status === "pending") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500">
          <span className="mr-1 inline-block animate-pulse">●</span>
          번역 생성 중입니다… (새로고침으로 확인)
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="text-xs text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline disabled:opacity-50"
        >
          {retrying ? "재시도 중…" : "오래 걸리면 재시도"}
        </button>
      </div>
    );
  }

  // failed → 원문 + 재시도 (실패가 히스토리를 막지 않는다)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5">
        <span className="text-xs text-amber-700">
          번역 생성에 실패했습니다. 아래는 원문입니다.
        </span>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {retrying ? "재시도 중…" : "재시도"}
        </button>
      </div>
      <Markdown>{sourceMd}</Markdown>
    </div>
  );
}
