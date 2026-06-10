import type { Role, TimelineBlock } from "@/lib/repo";

/**
 * 우측 댓글 사이드바 — 현재 placeholder.
 *
 * NOTE(worker-comments): 이 컴포넌트 내부만 교체하면 된다.
 * props로 이미 blocks(각 블록의 comments 포함)·viewerId·viewerRole·docId가
 * 전달된다. 댓글 작성은 repo.addComment(locked 블록 전용 강제)를 호출하는
 * 서버 액션을 app/doc/[id]/actions.ts에 추가해 사용할 것.
 * 스레드는 블록 높이에 맞춰 정렬 (block-{id} 앵커 참조 가능).
 */
export default function CommentSidebar({
  blocks,
  docId,
  viewerId,
  viewerRole,
}: {
  blocks: TimelineBlock[];
  docId: number;
  viewerId: number;
  viewerRole: Role;
}) {
  void docId;
  void viewerId;
  void viewerRole;
  const totalComments = blocks.reduce((n, b) => n + b.comments.length, 0);

  return (
    <aside className="hidden w-72 shrink-0 lg:block">
      <div className="sticky top-20 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center">
        <p className="text-sm text-gray-400">댓글 준비 중</p>
        <p className="mt-1 text-xs text-gray-300">
          블록 앵커 스레드 ({totalComments}개)
        </p>
      </div>
    </aside>
  );
}
