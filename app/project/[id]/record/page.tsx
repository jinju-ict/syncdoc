import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import type { CSSProperties } from "react";
import { sectionTitleL } from "@/lib/sections";
import { t, roleNameL } from "@/lib/i18n";
import Markdown from "@/components/common/Markdown";

export const dynamic = "force-dynamic";

const FONT =
  "var(--font-instrument), 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const MONO = "var(--font-jetbrains), monospace";

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #E9E6DE",
  borderRadius: 14,
  padding: "18px 20px",
};

function fmtDate(ts: string): string {
  return ts.slice(0, 10);
}
function fmtTime(ts: string): string {
  return ts.slice(11, 16);
}

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session) redirect("/start");

  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const project = repo.getProjectForUser(projectId, session.uid);
  if (!project) redirect("/start");
  const lang = repo.getUserLang(session.uid);

  await searchParams; // ?type — 양쪽 섹션 모두 표시(앵커 #minutes/#releases)

  const docId = repo.getProjectMainDocId(projectId);
  const meeting = docId ? repo.getMeetingLog(docId) : [];
  const releases = docId ? repo.listReleaseEntries(docId) : [];

  // 회의록 — 날짜별 그룹
  const byDate = new Map<string, typeof meeting>();
  for (const m of meeting) {
    const d = fmtDate(m.lockedAt);
    const arr = byDate.get(d);
    if (arr) arr.push(m);
    else byDate.set(d, [m]);
  }

  return (
    <div style={{ fontFamily: FONT, color: "#1A1C20", minHeight: "100vh", background: "#F6F5F2", wordBreak: "keep-all" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(246,245,242,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid #E6E3DC" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", height: 58, display: "flex", alignItems: "center", gap: 12, padding: "0 24px" }}>
          <Link href={`/project/${projectId}`} style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "inherit" }}>
            <span style={{ width: 27, height: 27, borderRadius: 8, background: "#2D4FD4", display: "grid", placeItems: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </span>
            <span style={{ fontSize: 15.5, fontWeight: 700 }}>SyncDoc</span>
          </Link>
          <span style={{ fontSize: 13, color: "#C2BEB4" }}>/</span>
          <span style={{ fontSize: 13, color: "#6E6A60" }}>{project.title}</span>
        </div>
      </header>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 24px 80px" }}>
        <Link href={`/project/${projectId}`} style={{ fontSize: 13, fontWeight: 600, color: "#8A857A", textDecoration: "none" }}>
          {t(lang, "rec.backProject")}
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "12px 0 4px" }}>{t(lang, "rec.heading")}</h1>
        <p style={{ fontSize: 13, color: "#9A958A", margin: "0 0 26px" }}>
          {t(lang, "rec.headingSub")}
        </p>

        {/* ===== 회의록 ===== */}
        <section id="minutes" style={{ marginBottom: 36, scrollMarginTop: 72 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{t(lang, "rec.minutes")}</h2>
            <span style={{ fontSize: 12.5, color: "#9A958A" }}>{t(lang, "rec.minutesSub")}</span>
            <a href={`/project/${projectId}/record/export?type=minutes`} style={{ marginInlineStart: "auto", fontSize: 12.5, fontWeight: 600, color: "#2D4FD4", textDecoration: "none", borderBottom: "1px solid #C9D6F6" }}>
              {t(lang, "pj.exportMd")}
            </a>
          </div>
          {meeting.length === 0 ? (
            <p style={{ ...card, fontSize: 13, color: "#9A958A" }}>{t(lang, "rec.minutesEmpty")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[...byDate.entries()].map(([date, entries]) => (
                <div key={date} style={{ ...card }}>
                  <p style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: "#2D4FD4", margin: "0 0 12px" }}>{date} · {entries.length}{t(lang, "rec.count")}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {entries.map((m) => (
                      <div key={m.id} style={{ borderInlineStart: "2px solid #EEEBE3", paddingInlineStart: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700 }}>{roleNameL(m.authorRole, lang)}</span>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: "#B2ABA0" }}>{fmtTime(m.lockedAt)}</span>
                          {m.sectionKey && (
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: "#6E6A60", background: "#F0EEE7", borderRadius: 5, padding: "1px 7px" }}>{sectionTitleL(m.sectionKey, lang)}</span>
                          )}
                        </div>
                        <div className="markdown-body" style={{ fontSize: 13.5, lineHeight: 1.65, color: "#34322C" }}>
                          <Markdown>{m.sourceMd}</Markdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ===== 릴리스 ===== */}
        <section id="releases" style={{ scrollMarginTop: 72 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{t(lang, "rec.releases")}</h2>
            <span style={{ fontSize: 12.5, color: "#9A958A" }}>{t(lang, "rec.releasesSub")}</span>
            <a href={`/project/${projectId}/record/export?type=releases`} style={{ marginInlineStart: "auto", fontSize: 12.5, fontWeight: 600, color: "#2D4FD4", textDecoration: "none", borderBottom: "1px solid #C9D6F6" }}>
              {t(lang, "pj.exportMd")}
            </a>
          </div>
          {releases.length === 0 ? (
            <p style={{ ...card, fontSize: 13, color: "#9A958A" }}>{t(lang, "rec.releasesEmpty")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {releases.map((r) => (
                <div key={r.id} style={{ ...card }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: "#2D4FD4", background: "#EDF1FE", border: "1px solid #D7E0F8", borderRadius: 6, padding: "1px 8px" }}>{r.versionLabel}</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{r.title ?? sectionTitleL(r.sectionKey, lang)}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: "#6E6A60", background: "#F0EEE7", borderRadius: 5, padding: "1px 7px" }}>{sectionTitleL(r.sectionKey, lang)}</span>
                    <span style={{ marginInlineStart: "auto", fontFamily: MONO, fontSize: 11, color: "#B2ABA0" }}>{r.createdAt.slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <div className="markdown-body" style={{ fontSize: 13.5, lineHeight: 1.65, color: "#34322C" }}>
                    <Markdown>{r.bodyMd}</Markdown>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
