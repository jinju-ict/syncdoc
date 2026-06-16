import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { logout } from "@/app/login/actions";
import AbstractHeader from "@/components/whitepaper/AbstractHeader";
import ChatRoom from "@/components/chat/ChatRoom";
import LevelSelector from "@/components/doc/LevelSelector";
import ArchiveButton from "@/components/doc/ArchiveButton";
import WhitepaperReader from "@/components/whitepaper/WhitepaperReader";
import DocLensShell from "@/components/doc/DocLensShell";
import { CONTENT_SECTIONS } from "@/lib/sections";
import { t } from "@/lib/i18n";
import { after } from "next/server";
import { runBlockJob, runSectionI18nJob, runClassifyJob, runDistillJob } from "@/lib/translation-runner";

export const dynamic = "force-dynamic";

const roleLabel = {
  planner: "기획자",
  developer: "개발자",
  designer: "디자이너",
  ops: "운영자",
} as const;

const langLabel = { ko: "한국어", en: "English", ja: "日本語" } as const;

const FONT =
  "var(--font-instrument), 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

const ROLE_AV: Record<string, { c: string; bg: string; bd: string }> = {
  planner: { c: "#6D4FC8", bg: "#F1EDFB", bd: "#E2DAF6" },
  developer: { c: "#0D7E74", bg: "#E6F4F2", bd: "#CDE7E2" },
  designer: { c: "#C2410C", bg: "#FBEEE4", bd: "#F1D9C5" },
  ops: { c: "#2D6FB0", bg: "#E7F0F8", bd: "#CFE0EE" },
};

/**
 * 메인 문서 뷰 (서버 컴포넌트).
 * 모든 데이터는 여기서 조회해 props로 내려준다 — 이후 워커(AI/댓글/Abstract/
 * Mermaid)는 하위 컴포넌트 내부만 교체하면 되고 이 파일은 수정할 필요가 없다.
 */
export default async function DocPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/start");

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) notFound();

  const sp = await searchParams;
  // 렌즈 2종: 대화(채팅) = 입력, 백서 = 출력.
  const lens: "conv" | "paper" = sp.lens === "conv" ? "conv" : "paper";

  const doc = repo.getDocument(docId);
  if (!doc) notFound();

  // 타임라인 = locked 블록만. draft는 작성자 본인 것만 별도 조회 (가시성 규칙).
  // 뷰어 직군: 렌더링·번역은 4직군(멤버십), 합의 게이트는 2축(getDocRole).
  const viewerProjectRole = repo.getDocProjectRole(docId, session.uid) ?? session.role;
  const ctx = repo.getDocContext(docId); // 프로젝트 맥락(브레드크럼·종류)
  const kindLabel =
    ctx?.kind === "meeting" ? "회의록" : ctx?.kind === "release" ? "릴리스" : null;
  const viewerLang = repo.getUserLang(session.uid);
  const blocks = repo.getTimeline(docId, viewerProjectRole, viewerLang);
  const attachments = repo.listAttachments(docId); // 채팅 첨부(파일/이미지)
  const abstract = repo.getLatestAbstract(docId);
  const signatures = repo.listSignatures(docId); // 멤버별 합의 서명
  const myLevel = repo.getUserLevel(session.uid);
  const archived = doc.status === "archived";
  const consensus = repo.getDocConsensus(docId); // 참여자 전원 서명 = 합의
  const agreed = consensus.agreed;

  // 백서 렌즈 데이터 — 절별 증류 산문 + 문서정보 카드용 멤버
  const sectionContent = repo.getSectionContentForLang(docId, viewerLang);

  // 자동 번역 — 뷰어(직군×언어)에게 없는 번역을 진입 시 생성(있으면 건너뜀, 실패는 재시도 버튼).
  if (!archived) {
    const blockJobs = repo.ensureBlockTranslations(docId, viewerProjectRole, viewerLang);
    const secJobs =
      viewerLang !== "ko" ? repo.ensureSectionTranslations(docId, viewerLang) : [];
    // 메시지 → 절 AI 분류 (미분류 메시지만, 비차단)
    const classifyJobs = repo.ensureMessageClassifications(docId);
    // 비서 자동화: 번역·분류를 끝낸 뒤, 내용이 바뀐 절을 자동 증류해 백서를 갱신한다.
    // (응답 후 실행 — 사용자를 막지 않는다. 시그니처 캐시로 중복 호출은 방지된다)
    after(async () => {
      await Promise.all([
        ...blockJobs.map((j) => runBlockJob(j, ctx?.projectId ?? null)),
        ...secJobs.map((j) => runSectionI18nJob(j)),
        ...classifyJobs.map((j) => runClassifyJob(j)),
      ]);
      const distillJobs = repo.ensureSectionDistills(docId);
      for (const j of distillJobs) await runDistillJob(j); // 순차 — 동시 AI 호출 제한
    });
  }
  const myProject = ctx?.projectId
    ? repo.getProjectForUser(ctx.projectId, session.uid)
    : null;
  const members = myProject?.members ?? [];
  // 백서 화면 분류 교정 권한 — 편집자 이상 (레거시·프로젝트 없는 문서는 허용)
  const canCurate = ctx?.projectId
    ? myProject?.myPerm === "owner" || myProject?.myPerm === "editor"
    : true;

  const whitepaperMeta = {
    title: doc.title,
    docId,
    statusLabel: archived ? "보관됨 · 읽기 전용" : "진행 중",
    createdAt: doc.createdAt,
    agreed,
    approvalPlannerAt: doc.approvalPlannerAt,
    approvalDeveloperAt: doc.approvalDeveloperAt,
    projectTitle: ctx?.projectTitle ?? null,
  };

  // ----- 렌즈별 본문 -----
  let lensContent: React.ReactNode;
  if (lens === "conv") {
    // 채팅방(v0.2): 프로젝트당 하나의 통합 타임라인. 메신저형 입력.
    lensContent = (
      <div className="mx-auto w-full max-w-[760px]">
        {archived && (
          <div className="mb-6 rounded-md border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
            📦 이 문서는 {doc.archivedAt ? doc.archivedAt.replace("T", " ").slice(0, 16) : ""}에
            보관되었습니다. 모든 내용은 읽기 전용으로 보존됩니다.
          </div>
        )}
        <ChatRoom
          blocks={blocks}
          members={members}
          attachments={attachments}
          viewerId={session.uid}
          viewerRole={viewerProjectRole}
          viewerLang={viewerLang}
          docId={docId}
          readOnly={archived}
        />
      </div>
    );
  } else {
    // 백서(기본): 목차 있는 산문 문서 + 문서 합의(서명·표지) 패널
    // 편집자에겐 절별 출처 메시지 교정(제외/재분류)을 함께 내려준다.
    const sourceBySection: Record<string, repo.SectionSourceMessage[]> = {};
    if (canCurate && !archived) {
      for (const s of CONTENT_SECTIONS)
        sourceBySection[s.key] = repo.getSectionSourceMessages(docId, s.key);
    }
    lensContent = (
      <div>
        <AbstractHeader
          abstract={abstract}
          consensus={consensus}
          viewerId={session.uid}
          lang={viewerLang}
          docId={docId}
          readOnly={archived}
        />
        <WhitepaperReader
          meta={whitepaperMeta}
          members={members}
          signatures={signatures}
          content={sectionContent}
          lang={viewerLang}
          canCurate={canCurate && !archived}
          sourceBySection={sourceBySection}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F5F2] text-gray-900">
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(246,245,242,0.88)",
          backdropFilter: "saturate(150%) blur(12px)",
          borderBottom: "1px solid #E6E3DC",
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            minHeight: 58,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            rowGap: 6,
            gap: 10,
            padding: "8px 26px",
          }}
        >
          <Link href="/start" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "inherit", flexShrink: 0 }}>
            <span style={{ width: 27, height: 27, borderRadius: 8, background: "#2D4FD4", display: "grid", placeItems: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </span>
            <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.01em" }}>SyncDoc</span>
          </Link>
          {ctx?.projectId && (
            <>
              <span style={{ fontSize: 13, color: "#C2BEB4", flexShrink: 0 }}>/</span>
              <Link href={`/project/${ctx.projectId}`} style={{ fontSize: 13, color: "#6E6A60", textDecoration: "none", flexShrink: 0 }}>
                {ctx.projectTitle}
              </Link>
            </>
          )}
          <span style={{ fontSize: 13, color: "#C2BEB4", flexShrink: 0 }}>/</span>
          <span style={{ fontSize: 13, color: "#3C3A34", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</span>
          {kindLabel && (
            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#6E6A60", background: "#F0EEE7", borderRadius: 6, padding: "2px 8px" }}>{kindLabel}</span>
          )}
          {archived && (
            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#6E6A60", background: "#EDEAE2", borderRadius: 6, padding: "2px 8px" }}>보관됨 · 읽기 전용</span>
          )}

          <span style={{ marginInlineStart: "auto", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <a
              href={`/doc/${docId}/export`}
              title="문서 전체를 Markdown 파일로 내려받습니다"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #E0DCD2", borderRadius: 10, padding: "6px 12px", fontSize: 13, fontWeight: 600, color: "#3C3A34", textDecoration: "none" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3C3A34" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M5 19h14" />
              </svg>
              내보내기
            </a>
            <ArchiveButton docId={docId} archived={archived} agreed={agreed} />
            <LevelSelector docId={docId} level={myLevel} lang={viewerLang} />
            <span
              title={`${roleLabel[viewerProjectRole]} · ${session.username}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 99,
                display: "grid",
                placeItems: "center",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
                background: ROLE_AV[viewerProjectRole].bg,
                color: ROLE_AV[viewerProjectRole].c,
                border: `1px solid ${ROLE_AV[viewerProjectRole].bd}`,
              }}
            >
              {(session.username || "U").trim().charAt(0).toUpperCase()}
            </span>
            <form action={logout} style={{ display: "flex" }}>
              <button type="submit" title="로그아웃" style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, border: "1px solid #E0DCD2", background: "#fff", cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9A958A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
                </svg>
              </button>
            </form>
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1200px] px-6 py-7">
        <DocLensShell
          docId={docId}
          activeLens={lens}
          lang={viewerLang}
          caption={`${langLabel[viewerLang]} · ${roleLabel[viewerProjectRole]} ${t(viewerLang, "perspectiveSuffix")}`}
        >
          {lensContent}
        </DocLensShell>
      </div>
    </div>
  );
}
