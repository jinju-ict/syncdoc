"use client";

/**
 * 우측 댓글 사이드바 — 블록 앵커 스레드.
 *
 * 수용 기준 (인라인 댓글 2항목):
 * ① 특정 블록을 지정해 댓글/답글 작성 — 카드 선택 → 댓글 폼, 댓글별 '답글' 버튼
 * ② 우측 사이드바에 해당 블록에 맞춰 스레드 표시 — 블록 단위 카드로 그룹핑
 *
 * 정렬 방식 (MVP): 픽셀 단위 absolute 정렬 대신 앵커 + 스크롤 동기화를 쓴다.
 * - 캔버스의 각 블록은 `block-{id}` 앵커(Timeline.tsx), 사이드바의 각 스레드
 *   카드는 `comments-block-{id}` 앵커 + scroll-mt(sticky 헤더 회피)를 가진다.
 * - 카드 헤더 클릭 = 해당 블록 활성화(하이라이트) + 캔버스의 블록으로 스크롤.
 *   선택 상태는 사이드바가 주도한다 (BlockView/Timeline은 수정 금지 영역).
 * - 댓글은 locked 블록 전용 — repo.addComment가 강제하고, 실패 메시지는
 *   폼 아래에 그대로 표시한다.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommentInfo, Role, TimelineBlock } from "@/lib/repo";
import { addComment } from "@/app/doc/[id]/comment-actions";

// 작성자 역할 구분 색 (기획자=인디고 / 개발자=에메랄드)
const roleStyle: Record<
  Role,
  { label: string; badge: string; bubble: string }
> = {
  planner: {
    label: "기획자",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    bubble: "border-indigo-100 bg-indigo-50/50",
  },
  developer: {
    label: "개발자",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    bubble: "border-emerald-100 bg-emerald-50/50",
  },
};

/** ISO → "MM-DD HH:mm" (MVP 표기) */
function formatTime(iso: string): string {
  return iso.slice(5, 16).replace("T", " ");
}

/** sticky 헤더(약 3.5rem)에 가리지 않게 보정해 캔버스 블록으로 스크롤 */
function scrollToBlock(blockId: number): void {
  const el = document.getElementById(`block-${blockId}`);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: "smooth" });
}

export default function CommentSidebar({
  blocks,
  docId,
  viewerId,
  viewerRole,
  readOnly = false,
}: {
  blocks: TimelineBlock[];
  docId: number;
  viewerId: number;
  viewerRole: Role;
  /** 보관된 문서 — 기존 댓글은 열람 가능, 작성/답글 폼은 숨김 */
  readOnly?: boolean;
}) {
  const [activeBlockId, setActiveBlockId] = useState<number | null>(null);

  const totalComments = blocks.reduce((n, b) => n + b.comments.length, 0);

  const selectBlock = (id: number) => {
    setActiveBlockId((cur) => (cur === id ? null : id));
    scrollToBlock(id);
  };

  return (
    <aside className="w-full shrink-0 lg:w-72">
      <div className="space-y-3 pb-4 pr-1 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-gray-700">댓글</h2>
          <span className="text-xs text-gray-400">{totalComments}개</span>
        </div>

        <p className="px-1 text-[11px] leading-relaxed text-gray-400">
          블록 태그를 누르면 해당 블록으로 이동하고 댓글을 달 수 있습니다.
          {" "}
          <span className={`rounded-sm border px-1 ${roleStyle.planner.badge}`}>
            기획자
          </span>{" "}
          <span
            className={`rounded-sm border px-1 ${roleStyle.developer.badge}`}
          >
            개발자
          </span>
        </p>

        {blocks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-xs text-gray-400">
            확정(잠금)된 블록이 생기면
            <br />
            블록별 댓글을 달 수 있습니다.
          </div>
        ) : (
          blocks.map((block) => (
            <BlockThreadCard
              key={block.id}
              block={block}
              docId={docId}
              viewerId={viewerId}
              viewerRole={viewerRole}
              active={activeBlockId === block.id}
              onSelect={() => selectBlock(block.id)}
              readOnly={readOnly}
            />
          ))
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// 블록 단위 스레드 카드 — 캔버스의 block-{id}와 1:1 대응하는 앵커
// ---------------------------------------------------------------------------

function BlockThreadCard({
  block,
  docId,
  viewerId,
  viewerRole,
  active,
  onSelect,
  readOnly,
}: {
  block: TimelineBlock;
  docId: number;
  viewerId: number;
  viewerRole: Role;
  active: boolean;
  onSelect: () => void;
  readOnly: boolean;
}) {
  const [replyTo, setReplyTo] = useState<number | null>(null);

  // 스레드 구성: parent_id 기준 트리 (고아 답글은 최상위로 승격)
  const byParent = new Map<number | null, CommentInfo[]>();
  const ids = new Set(block.comments.map((c) => c.id));
  for (const c of block.comments) {
    const key = c.parentId !== null && ids.has(c.parentId) ? c.parentId : null;
    const arr = byParent.get(key);
    if (arr) arr.push(c);
    else byParent.set(key, [c]);
  }
  const roots = byParent.get(null) ?? [];

  return (
    <section
      id={`comments-block-${block.id}`}
      className={`scroll-mt-20 rounded-lg border bg-white transition-colors ${
        active ? "border-gray-400 shadow-sm" : "border-gray-200"
      }`}
    >
      {/* 블록 지정: 카드 헤더 = 블록 앵커 (클릭 → 캔버스 블록으로 스크롤) */}
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
      >
        <span className="truncate font-mono text-[11px] text-gray-500">
          {block.versionTag}
        </span>
        <span className="shrink-0 text-[11px] text-gray-400">
          💬 {block.comments.length}
        </span>
      </button>

      {(block.comments.length > 0 || active) && (
        <div className="space-y-2 border-t border-gray-100 px-3 py-2">
          {roots.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              byParent={byParent}
              docId={docId}
              blockId={block.id}
              viewerId={viewerId}
              replyTo={replyTo}
              onReplyTo={setReplyTo}
              depth={0}
              readOnly={readOnly}
            />
          ))}

          {/* 새 댓글 폼 — 활성 블록에만 노출 (보관 문서는 작성 불가) */}
          {readOnly ? null : active ? (
            <CommentForm
              docId={docId}
              blockId={block.id}
              parentId={null}
              placeholder={`${roleStyle[viewerRole].label}로 댓글 작성…`}
            />
          ) : (
            block.comments.length > 0 && (
              <button
                type="button"
                onClick={onSelect}
                className="text-[11px] text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
              >
                댓글 달기
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 댓글 노드 (말풍선) — parent_id 트리를 재귀 렌더, 들여쓰기로 스레드 표현
// ---------------------------------------------------------------------------

function CommentNode({
  comment,
  byParent,
  docId,
  blockId,
  viewerId,
  replyTo,
  onReplyTo,
  depth,
  readOnly,
}: {
  comment: CommentInfo;
  byParent: Map<number | null, CommentInfo[]>;
  docId: number;
  blockId: number;
  viewerId: number;
  replyTo: number | null;
  onReplyTo: (id: number | null) => void;
  depth: number;
  readOnly: boolean;
}) {
  const style = roleStyle[comment.authorRole];
  const children = byParent.get(comment.id) ?? [];
  const isReplying = replyTo === comment.id;

  return (
    <div className={depth > 0 ? "ml-3 border-l border-gray-200 pl-2" : ""}>
      {/* 말풍선 */}
      <div className={`rounded-lg rounded-tl-none border px-2.5 py-1.5 ${style.bubble}`}>
        <div className="mb-0.5 flex items-center gap-1.5">
          <span
            className={`rounded-sm border px-1 text-[10px] font-medium ${style.badge}`}
          >
            {style.label}
          </span>
          <span className="text-[11px] text-gray-500">
            {comment.authorUsername}
            {comment.authorId === viewerId && " (나)"}
          </span>
          <span className="ml-auto text-[10px] text-gray-400">
            {formatTime(comment.createdAt)}
          </span>
        </div>
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-800">
          {comment.body}
        </p>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onReplyTo(isReplying ? null : comment.id)}
            className="mt-1 text-[10px] text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
          >
            {isReplying ? "답글 취소" : "답글"}
          </button>
        )}
      </div>

      {/* 답글 폼 */}
      {isReplying && !readOnly && (
        <div className="ml-3 mt-1.5">
          <CommentForm
            docId={docId}
            blockId={blockId}
            parentId={comment.id}
            placeholder={`${comment.authorUsername}님에게 답글…`}
            onDone={() => onReplyTo(null)}
          />
        </div>
      )}

      {/* 자식 스레드 */}
      {children.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {children.map((child) => (
            <CommentNode
              key={child.id}
              comment={child}
              byParent={byParent}
              docId={docId}
              blockId={blockId}
              viewerId={viewerId}
              replyTo={replyTo}
              onReplyTo={onReplyTo}
              depth={depth + 1}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 댓글/답글 작성 폼 — 서버 액션 호출, 에러는 폼 아래에 그대로 표시
// ---------------------------------------------------------------------------

function CommentForm({
  docId,
  blockId,
  parentId,
  placeholder,
  onDone,
}: {
  docId: number;
  blockId: number;
  parentId: number | null;
  placeholder: string;
  onDone?: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (body.trim().length === 0) {
      setError("댓글 내용을 입력하세요.");
      return;
    }
    startTransition(async () => {
      const result = await addComment(docId, blockId, body, parentId);
      if (result.ok) {
        setBody("");
        setError(null);
        onDone?.();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-1"
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
        disabled={isPending}
        className="w-full resize-none rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:bg-gray-50"
      />
      {error && <p className="text-[11px] text-amber-700">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {isPending ? "등록 중…" : parentId ? "답글 등록" : "댓글 등록"}
        </button>
      </div>
    </form>
  );
}
