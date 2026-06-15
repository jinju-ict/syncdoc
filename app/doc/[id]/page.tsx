import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { logout } from "@/app/login/actions";
import AbstractHeader from "@/components/AbstractHeader";
import Timeline from "@/components/Timeline";
import DraftEditor from "@/components/DraftEditor";
import ChatRoom from "@/components/ChatRoom";
import LevelSelector from "@/components/LevelSelector";
import ArchiveButton from "@/components/ArchiveButton";
import WhitepaperReader from "@/components/WhitepaperReader";
import DocLensShell from "@/components/DocLensShell";
import DistillButton from "@/components/DistillButton";
import DataLens, { type DataChunk } from "@/components/DataLens";
import Markdown from "@/components/Markdown";
import { CONTENT_SECTIONS, isSectionKey, sectionTitleL as secTitleL, type SectionKey } from "@/lib/sections";
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
  if (!session) redirect("/login");

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) notFound();

  const sp = await searchParams;
  const lens: "paper" | "side" | "conv" | "data" =
    sp.lens === "conv"
      ? "conv"
      : sp.lens === "side"
        ? "side"
        : sp.lens === "data"
          ? "data"
          : "paper";
  const secRaw = typeof sp.sec === "string" ? sp.sec : undefined;
  const sec: SectionKey | undefined = isSectionKey(secRaw) ? secRaw : undefined;
  const sideSec: SectionKey = sec ?? "why";

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
          viewerId={session.uid}
          viewerRole={viewerProjectRole}
          viewerLang={viewerLang}
          docId={docId}
          readOnly={archived}
        />
      </div>
    );
  } else if (lens === "side") {
    // 나란히: 한 절의 본문(좌) + 그 절의 대화(우)
    const secMeta = CONTENT_SECTIONS.find((s) => s.key === sideSec)!;
    const secBlocks = repo.getTimeline(docId, viewerProjectRole, viewerLang, sideSec);
    const secDraft = repo.getOwnDraft(docId, session.uid, sideSec);
    const secItems = sectionContent.filter((c) => c.sectionKey === sideSec);
    // 증류 상태: 대화 없음 / 증류 필요(stale) / 최신(fresh)
    const secSig = repo.sectionSourceSig(docId, sideSec);
    const distilled = repo.getDistilledItem(docId, sideSec);
    const distillState: "none" | "stale" | "fresh" =
      secBlocks.length === 0
        ? "none"
        : distilled && distilled.sourceSig === secSig
          ? "fresh"
          : "stale";
    lensContent = (
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* 좌: 절 본문 */}
        <section className="rounded-2xl border border-[#E9E6DE] bg-white p-6">
          <div className="mb-4 flex items-baseline gap-2">
            <span className="font-mono text-sm text-[#2D4FD4]">{secMeta.num}</span>
            <h2 className="text-lg font-bold tracking-tight">{secTitleL(sideSec, viewerLang)}</h2>
            <span className="font-mono text-[11px] text-[#B7B1A4]">{secMeta.mnemonic}</span>
          </div>
          {secItems.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#DAD5C8] bg-[#FAF9F5] px-4 py-6 text-center text-sm text-[#9A958A]">
              아직 작성 전입니다. 오른쪽 대화에서 논의하고 합의하면 이 자리에 채워집니다.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {secItems.map((it) => (
                <div key={it.id}>
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-[15px] font-bold">{it.title}</h3>
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        it.status === "agreed"
                          ? "bg-[#E8F5EC] text-[#1B7F45]"
                          : "bg-[#EDF1FE] text-[#2D4FD4]"
                      }`}
                    >
                      {it.status === "agreed" ? t(viewerLang, "agreed") : t(viewerLang, "discussing")}
                    </span>
                  </div>
                  <div className="markdown-body text-[14.5px] leading-7 text-[#34322C]">
                    <Markdown>{it.bodyMd}</Markdown>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 우: 그 절의 대화 */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9A958A]">
              {secTitleL(sideSec, viewerLang)} · {t(viewerLang, "sectionConversation")}
            </p>
            {!archived && (
              <span className="ml-auto">
                <DistillButton docId={docId} sectionKey={sideSec} state={distillState} lang={viewerLang} />
              </span>
            )}
          </div>
          <Timeline blocks={secBlocks} viewerRole={viewerProjectRole} viewerLang={viewerLang} docId={docId} />
          {!archived && (
            <div className="mt-6">
              <DraftEditor
                docId={docId}
                draft={secDraft ? { id: secDraft.id, sourceMd: secDraft.sourceMd } : null}
                viewerRole={viewerProjectRole}
                sectionKey={sideSec}
                sectionLabel={secTitleL(sideSec, viewerLang)}
              />
            </div>
          )}
        </div>
      </div>
    );
  } else if (lens === "data") {
    // 데이터(RAG): 청크 시각화 + 메타데이터 질의 + 스키마 JSON
    const tokensOf = (s: string) => Math.max(1, Math.round(s.length / 2));
    const chunks: DataChunk[] = [
      {
        key: "meta",
        sectionTitle: t(viewerLang, "docInfo"),
        kind: t(viewerLang, "kind.meta"),
        status: agreed ? "agreed" : "discussing",
        tokens: 24,
        title: doc.title,
        preview: whitepaperMeta.statusLabel,
      },
    ];
    for (const s of CONTENT_SECTIONS) {
      const sTitle = secTitleL(s.key, viewerLang);
      const items = sectionContent.filter((c) => c.sectionKey === s.key);
      if (items.length === 0) {
        chunks.push({ key: s.key, sectionTitle: sTitle, kind: t(viewerLang, "kind.empty"), status: "empty", tokens: 0, title: sTitle, preview: "" });
      } else {
        for (const it of items) {
          chunks.push({
            key: it.subKey ?? s.key,
            sectionTitle: sTitle,
            kind: t(viewerLang, "kind.section"),
            status: it.status,
            tokens: tokensOf(it.bodyMd),
            title: it.title ?? sTitle,
            preview: it.bodyMd.replace(/\s+/g, " ").slice(0, 80),
          });
        }
      }
    }
    const schemaJson = JSON.stringify(
      {
        schema: "syncdoc.prd.v2",
        doc_id: `doc-${docId}`,
        sections: CONTENT_SECTIONS.map((s) => ({
          key: s.key,
          title: s.title,
          items: sectionContent
            .filter((c) => c.sectionKey === s.key)
            .map((it) => ({ key: it.subKey ?? s.key, status: it.status })),
        })),
      },
      null,
      2
    );
    lensContent = <DataLens chunks={chunks} schemaJson={schemaJson} lang={viewerLang} />;
  } else {
    // 백서(기본): 목차 있는 산문 문서 + 문서 합의(서명·표지) 패널
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
          sec={sec}
          lang={viewerLang}
          caption={`${langLabel[viewerLang]} · ${roleLabel[viewerProjectRole]} ${t(viewerLang, "perspectiveSuffix")}`}
        >
          {lensContent}
        </DocLensShell>
      </div>
    </div>
  );
}
