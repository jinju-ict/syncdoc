"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveDocument, unarchiveDocument } from "@/app/doc/[id]/actions";

/**
 * 문서 보관/해제 버튼 — 보관은 합의 여부와 무관하게 언제든 가능 (상태 전환일 뿐
 * 내용은 영구 보존). 합의 전 문서는 확인 한 번을 거친다.
 */
export default function ArchiveButton({
  docId,
  archived,
  agreed,
}: {
  docId: number;
  archived: boolean;
  agreed: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = () => {
    if (!archived && !agreed) {
      const ok = window.confirm(
        "아직 양측 합의 전입니다. 보관하면 읽기 전용이 됩니다 (언제든 해제 가능). 보관할까요?"
      );
      if (!ok) return;
    }
    startTransition(async () => {
      if (archived) await unarchiveDocument(docId);
      else await archiveDocument(docId);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:border-gray-500 hover:text-gray-900 disabled:opacity-50"
      title={
        archived
          ? "보관을 해제하고 이어서 작성합니다"
          : "문서를 읽기 전용으로 보관합니다 (내용은 영구 보존)"
      }
    >
      {isPending ? "처리 중…" : archived ? "보관 해제" : "보관하기"}
    </button>
  );
}
