import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import type { CSSProperties } from "react";
import type { Lang } from "@/lib/repo";
import { t, roleNameL, permLabelL } from "@/lib/i18n";
import MemberAdmin from "@/components/project/MemberAdmin";
import InviteForm from "@/components/project/InviteForm";
import PendingInvites from "@/components/project/PendingInvites";
import JoinRequests from "@/components/project/JoinRequests";
import JoinRequestForm from "@/components/project/JoinRequestForm";

export const dynamic = "force-dynamic";

const FONT =
  "var(--font-instrument), 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

function fmt(ts: string | null): string {
  return ts ? ts.replace("T", " ").slice(0, 16) : "";
}

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #E9E6DE",
  borderRadius: 16,
  padding: "20px 22px",
};

export default async function ProjectWorkspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/start");

  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const project = repo.getProjectForUser(projectId, session.uid);
  const lang = repo.getUserLang(session.uid);

  // 비멤버 — 입장 요청 화면(링크 공유 시) 또는 비공개 안내
  if (!project) {
    const meta = repo.getProjectMeta(projectId);
    if (!meta) notFound();
    const myStatus =
      repo.getMyJoinRequest(projectId, session.uid)?.status ?? null;
    return (
      <JoinScreen
        projectId={projectId}
        title={meta.title}
        linkShared={meta.linkShared}
        myStatus={myStatus}
        lang={lang}
      />
    );
  }

  const docs = repo.listProjectDocuments(projectId);
  const mainDocs = docs.filter((d) => d.kind === "main");
  const canEdit = project.myPerm === "owner" || project.myPerm === "editor";
  const isOwner = project.myPerm === "owner";
  const pendingInvites = isOwner ? repo.listProjectInvites(projectId) : [];
  const joinRequests = isOwner ? repo.listJoinRequests(projectId) : [];

  return (
    <div style={{ fontFamily: FONT, color: "#1A1C20", minHeight: "100vh", background: "#F6F5F2", wordBreak: "keep-all" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(246,245,242,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid #E6E3DC" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", height: 58, display: "flex", alignItems: "center", gap: 12, padding: "0 24px" }}>
          <Link href="/start" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "inherit" }}>
            <span style={{ width: 27, height: 27, borderRadius: 8, background: "#2D4FD4", display: "grid", placeItems: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </span>
            <span style={{ fontSize: 15.5, fontWeight: 700 }}>SyncDoc</span>
          </Link>
        </div>
      </header>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "28px 24px 80px" }}>
        <Link href="/start" style={{ fontSize: 13, fontWeight: 600, color: "#8A857A", textDecoration: "none" }}>
          {t(lang, "pj.back")}
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "12px 0 6px" }}>{project.title}</h1>
        <p style={{ fontSize: 13, color: "#9A958A", margin: "0 0 8px" }}>
          {t(lang, "pj.myRole")} <strong style={{ color: "#6E6A60" }}>{roleNameL(project.myRole, lang)}</strong> · {t(lang, "pj.myPerm")}{" "}
          <strong style={{ color: "#6E6A60" }}>{permLabelL(project.myPerm, lang)}</strong>
        </p>
        {/* 팀원 / 초대 관리 */}
        <div className="proj-grid" style={{ margin: "18px 0 30px" }}>
          <div style={{ ...card }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 14px" }}>
              {t(lang, "members")} {project.members.length}
              {isOwner && <span style={{ marginInlineStart: 8, fontWeight: 600, color: "#C2BDB0", textTransform: "none", letterSpacing: 0 }}>{t(lang, "pj.ownerCanManage")}</span>}
            </p>
            <MemberAdmin
              projectId={projectId}
              members={project.members}
              isOwner={isOwner}
              currentUserId={session.uid}
              lang={lang}
            />
          </div>

          {canEdit ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ ...card }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, margin: "0 0 12px" }}>{t(lang, "mem.invite")}</p>
                <InviteForm projectId={projectId} lang={lang} />
              </div>
              {isOwner && <JoinRequests projectId={projectId} requests={joinRequests} lang={lang} />}
              {isOwner && <PendingInvites projectId={projectId} invites={pendingInvites} lang={lang} />}
            </div>
          ) : (
            isOwner && <PendingInvites projectId={projectId} invites={pendingInvites} lang={lang} />
          )}
        </div>

        <DocSection title={t(lang, "pj.whitepaper")} docs={mainDocs} lang={lang} />

        {/* 자동 파생 기록 — 따로 만들지 않는다. 백서 대화가 곧 회의록이자 릴리스. */}
        <section style={{ marginBottom: 26 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 12px" }}>
            {t(lang, "pj.records")} <span style={{ color: "#C2BDB0", fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>· {t(lang, "pj.recordsAuto")}</span>
          </p>
          <div className="sd-grid-2">
            <RecordCard projectId={projectId} type="minutes" lang={lang} />
            <RecordCard projectId={projectId} type="releases" lang={lang} />
          </div>
        </section>
      </div>
    </div>
  );
}

function JoinScreen({
  projectId,
  title,
  linkShared,
  myStatus,
  lang,
}: {
  projectId: number;
  title: string;
  linkShared: boolean;
  myStatus: repo.JoinRequestStatus | null;
  lang: Lang;
}) {
  return (
    <div style={{ fontFamily: FONT, color: "#1A1C20", minHeight: "100vh", background: "#F6F5F2", wordBreak: "keep-all" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "64px 24px" }}>
        <Link href="/start" style={{ fontSize: 13, fontWeight: 600, color: "#8A857A", textDecoration: "none" }}>
          {t(lang, "join.backHome")}
        </Link>
        <div style={{ ...card, marginTop: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 6px" }}>
            {t(lang, "join.requestTitle")}
          </p>
          <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 8px" }}>{title}</h1>
          {linkShared ? (
            <>
              <p style={{ fontSize: 13, color: "#9A958A", margin: "0 0 18px" }}>{t(lang, "join.requestDesc")}</p>
              <JoinRequestForm projectId={projectId} myStatus={myStatus} lang={lang} />
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: "#A1462F", background: "#FBEDE8", border: "1px solid #F0D6CC", borderRadius: 10, padding: "12px 14px", margin: "8px 0 0" }}>
              {t(lang, "join.private")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordCard({
  projectId,
  type,
  lang,
}: {
  projectId: number;
  type: "minutes" | "releases";
  lang: Lang;
}) {
  const title = type === "minutes" ? t(lang, "rec.minutes") : t(lang, "rec.releases");
  const desc = type === "minutes" ? t(lang, "pj.recMinutesDesc") : t(lang, "pj.recReleasesDesc");
  return (
    <div style={{ ...card }}>
      <span style={{ display: "block", fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</span>
      <span style={{ display: "block", fontSize: 12, color: "#9A958A", margin: "4px 0 14px" }}>{desc}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <Link href={`/project/${projectId}/record?type=${type}`} style={{ flex: 1, textAlign: "center", background: "#fff", border: "1px solid #C9D6F6", color: "#2D4FD4", borderRadius: 9, padding: "7px 0", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
          {t(lang, "pj.view")}
        </Link>
        <a href={`/project/${projectId}/record/export?type=${type}`} style={{ flex: 1, textAlign: "center", background: "#fff", border: "1px solid #E0DCD2", color: "#6E6A60", borderRadius: 9, padding: "7px 0", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
          {t(lang, "pj.exportMd")}
        </a>
      </div>
    </div>
  );
}

function DocSection({
  title,
  docs,
  lang,
}: {
  title: string;
  docs: repo.ProjectDocItem[];
  lang: Lang;
}) {
  return (
    <section style={{ marginBottom: 26 }}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 12px" }}>
        {title} {docs.length > 0 && <span style={{ color: "#C2BDB0" }}>· {docs.length}</span>}
      </p>

      {docs.length === 0 && (
        <p style={{ ...card, fontSize: 13, color: "#9A958A" }}>{t(lang, "pj.empty")}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {docs.map((d) => (
          <Link key={d.id} href={`/doc/${d.id}`} style={{ ...card, display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{d.title}</span>
              <span style={{ display: "block", fontSize: 12, color: "#9A958A", marginTop: 3 }}>
                {t(lang, "pj.whitepaper")} · {d.blockCount}
                {d.lastLockedAt ? ` · ${fmt(d.lastLockedAt)}` : d.createdAt ? ` · ${fmt(d.createdAt)}` : ""}
              </span>
            </span>
            {d.agreed && (
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#0D7E74", background: "#E6F4F2", borderRadius: 99, padding: "3px 10px" }}>
                ✅ {t(lang, "agreed")}
              </span>
            )}
            {d.status === "archived" && (
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#6E6A60", background: "#EDEAE2", borderRadius: 99, padding: "3px 10px" }}>
                {lang === "en" ? "Archived" : lang === "ja" ? "アーカイブ" : "보관됨"}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
