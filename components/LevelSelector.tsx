"use client";

import { useTransition } from "react";
import { setMyLevel } from "@/app/doc/[id]/actions";
import type { ExpertiseLevel } from "@/lib/schema";

const LEVEL_LABEL: Record<ExpertiseLevel, string> = {
  beginner: "입문",
  intermediate: "중급",
  expert: "전문가",
};

/**
 * 내 숙련도 레벨 선택 — 상대 직군의 글이 내 수준에 맞춰 번역된다.
 * 변경은 이후 새 블록의 번역부터 적용 (기존 번역은 유지).
 */
export default function LevelSelector({
  docId,
  level,
}: {
  docId: number;
  level: ExpertiseLevel;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <label
      className="flex items-center gap-1.5 text-sm text-gray-600"
      title="상대 직군의 글이 선택한 수준에 맞춰 번역됩니다. 변경은 이후 새 블록부터 적용됩니다."
    >
      <span className="text-gray-400">내 레벨</span>
      <select
        value={level}
        disabled={isPending}
        onChange={(e) =>
          startTransition(() => setMyLevel(docId, e.target.value))
        }
        className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-700 focus:border-gray-500 focus:outline-none disabled:opacity-50"
      >
        {(Object.keys(LEVEL_LABEL) as ExpertiseLevel[]).map((v) => (
          <option key={v} value={v}>
            {LEVEL_LABEL[v]}
          </option>
        ))}
      </select>
    </label>
  );
}
