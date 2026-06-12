import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { logout } from "@/app/login/actions";
import AbstractHeader from "@/components/AbstractHeader";
import Timeline from "@/components/Timeline";
import DraftEditor from "@/components/DraftEditor";
import CommentSidebar from "@/components/CommentSidebar";
import LevelSelector from "@/components/LevelSelector";
import ArchiveButton from "@/components/ArchiveButton";

export const dynamic = "force-dynamic";

const roleLabel = { planner: "기획자", developer: "개발자" } as const;

/**
 * 메인 문서 뷰 (서버 컴포넌트).
 * 모든 데이터는 여기서 조회해 props로 내려준다 — 이후 워커(AI/댓글/Abstract/
 * Mermaid)는 하위 컴포넌트 내부만 교체하면 되고 이 파일은 수정할 필요가 없다.
 */
export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) notFound();

  const doc = repo.getDocument(docId);
  if (!doc) notFound();

  // 타임라인 = locked 블록만. draft는 작성자 본인 것만 별도 조회 (가시성 규칙).
  const blocks = repo.getTimeline(docId);
  const draft = repo.getOwnDraft(docId, session.uid);
  const abstract = repo.getLatestAbstract(docId);
  const myLevel = repo.getUserLevel(session.uid);
  const archived = doc.status === "archived";
  const agreed = Boolean(doc.approvalPlannerAt && doc.approvalDeveloperAt);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="text-lg font-semibold hover:text-gray-600">
              SyncDoc
            </Link>
            <span className="text-sm text-gray-500">{doc.title}</span>
            {archived && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                보관됨 · 읽기 전용
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a
              href={`/doc/${docId}/export`}
              className="text-xs text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
              title="문서 전체를 Markdown 파일로 내려받습니다"
            >
              내보내기(.md)
            </a>
            <ArchiveButton docId={docId} archived={archived} agreed={agreed} />
            <LevelSelector docId={docId} level={myLevel} />
            <span className="rounded-full border border-gray-300 px-2.5 py-0.5 text-gray-600">
              {roleLabel[session.role]} · {session.username}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="text-gray-400 hover:text-gray-700"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        {/* 중앙 캔버스 */}
        <main className="min-w-0 flex-1">
          {archived && (
            <div className="mb-6 rounded-md border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
              📦 이 문서는 {doc.archivedAt ? doc.archivedAt.replace("T", " ").slice(0, 16) : ""}에
              보관되었습니다. 모든 내용은 읽기 전용으로 보존됩니다 — 이어서 작성하려면
              우측 상단 <strong>보관 해제</strong>를 누르세요.
            </div>
          )}
          <AbstractHeader
            abstract={abstract}
            approvalPlannerAt={doc.approvalPlannerAt}
            approvalDeveloperAt={doc.approvalDeveloperAt}
            docId={docId}
            viewerRole={session.role}
            readOnly={archived}
          />
          <Timeline blocks={blocks} viewerRole={session.role} docId={docId} />
          {!archived && (
            <div className="mt-8">
              <DraftEditor
                docId={docId}
                draft={draft ? { id: draft.id, sourceMd: draft.sourceMd } : null}
                viewerRole={session.role}
              />
            </div>
          )}
        </main>

        {/* 우측 댓글 사이드바 */}
        <CommentSidebar
          blocks={blocks}
          docId={docId}
          viewerId={session.uid}
          viewerRole={session.role}
          readOnly={archived}
        />
      </div>
    </div>
  );
}
