import type { Lang, ProjectRole, TimelineBlock } from "@/lib/repo";
import BlockView from "./BlockView";

/**
 * 블록 타임라인 — locked 블록만 받는다 (draft 가시성 규칙은 repo 계층에서 강제).
 */
export default function Timeline({
  blocks,
  viewerRole,
  viewerLang = "ko",
  docId,
}: {
  blocks: TimelineBlock[];
  viewerRole: ProjectRole;
  viewerLang?: Lang;
  docId: number;
}) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-400">
        아직 확정된 블록이 없습니다. 아래 에디터에서 첫 블록을 작성해 보내세요.
      </div>
    );
  }

  return (
    <ol className="space-y-6">
      {blocks.map((block) => (
        <li key={block.id} id={`block-${block.id}`}>
          <BlockView block={block} viewerRole={viewerRole} viewerLang={viewerLang} docId={docId} />
        </li>
      ))}
    </ol>
  );
}
