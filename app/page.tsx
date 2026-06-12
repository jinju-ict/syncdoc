import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { listDocuments, type DocumentListItem } from "@/lib/repo";
import { logout } from "@/app/login/actions";
import { createNewDocument } from "./actions";

export const dynamic = "force-dynamic";

const roleLabel = { planner: "기획자", developer: "개발자" } as const;

function formatTs(ts: string): string {
  return ts.replace("T", " ").slice(0, 16);
}

/** 홈 = 문서 목록. 진행 중 / 보관됨 섹션 + 새 문서 시작. */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = await searchParams;

  const docs = listDocuments();
  const active = docs.filter((d) => d.status === "active");
  const archived = docs.filter((d) => d.status === "archived");

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <span className="text-lg font-semibold">SyncDoc</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full border border-gray-300 px-2.5 py-0.5 text-gray-600">
              {roleLabel[session.role]} · {session.username}
            </span>
            <form action={logout}>
              <button type="submit" className="text-gray-400 hover:text-gray-700">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* 새 문서 시작 */}
        <form action={createNewDocument} className="mb-8 flex gap-2">
          <input
            name="title"
            type="text"
            required
            placeholder="새 문서 제목…"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            새 문서 시작
          </button>
        </form>
        {params.error === "empty-title" && (
          <p className="-mt-6 mb-6 text-xs text-red-600">문서 제목을 입력하세요.</p>
        )}

        {/* 진행 중 */}
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            진행 중 ({active.length})
          </h2>
          {active.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
              진행 중인 문서가 없습니다. 새 문서를 시작하세요.
            </p>
          ) : (
            <ul className="space-y-2">
              {active.map((d) => (
                <DocCard key={d.id} doc={d} />
              ))}
            </ul>
          )}
        </section>

        {/* 보관됨 — 삭제는 없다. 모든 문서는 영구 보존되어 추적 가능 */}
        {archived.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              보관됨 ({archived.length})
            </h2>
            <ul className="space-y-2">
              {archived.map((d) => (
                <DocCard key={d.id} doc={d} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function DocCard({ doc }: { doc: DocumentListItem }) {
  const agreed = Boolean(doc.approvalPlannerAt && doc.approvalDeveloperAt);
  const archived = doc.status === "archived";
  const lastActivity = doc.lastLockedAt ?? doc.createdAt;

  return (
    <li>
      <Link
        href={`/doc/${doc.id}`}
        className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:border-gray-400 ${
          archived ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
        }`}
      >
        <div className="min-w-0">
          <p className={`truncate text-sm font-medium ${archived ? "text-gray-500" : "text-gray-900"}`}>
            {doc.title}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            블록 {doc.blockCount}개
            {lastActivity && ` · 마지막 활동 ${formatTs(lastActivity)}`}
            {archived && doc.archivedAt && ` · 보관 ${formatTs(doc.archivedAt)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {agreed && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              ✅ 합의됨
            </span>
          )}
          {archived && (
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              보관됨 · 읽기 전용
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
