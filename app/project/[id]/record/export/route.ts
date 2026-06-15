import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import type { ProjectRole } from "@/lib/repo";
import { sectionLabel } from "@/lib/sections";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<ProjectRole, string> = {
  planner: "기획자",
  developer: "개발자",
  designer: "디자이너",
  ops: "운영자",
};

const fmtTs = (ts: string) => ts.replace("T", " ").slice(0, 16);

/**
 * 파생 기록 내보내기 — ?type=minutes(회의록) | releases(릴리스).
 * 회의록·릴리스는 따로 만들지 않고 백서 대화에서 파생되므로 여기서 .md로 직렬화한다.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("unauthorized", { status: 401 });

  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) return new NextResponse("not found", { status: 404 });

  const project = repo.getProjectForUser(projectId, session.uid);
  if (!project) return new NextResponse("forbidden", { status: 403 });

  const type = new URL(request.url).searchParams.get("type") === "releases" ? "releases" : "minutes";
  const docId = repo.getProjectMainDocId(projectId);

  const lines: string[] = [];
  const stamp = fmtTs(new Date().toISOString());

  if (type === "minutes") {
    const meeting = docId ? repo.getMeetingLog(docId) : [];
    lines.push(`# ${project.title} — 회의록`);
    lines.push("");
    lines.push(`> SyncDoc 자동 생성 (백서 대화 파생) · ${stamp} · ${meeting.length}건`);
    lines.push("");
    let curDate = "";
    for (const m of meeting) {
      const d = m.lockedAt.slice(0, 10);
      if (d !== curDate) {
        curDate = d;
        lines.push(`## ${d}`);
        lines.push("");
      }
      const sec = m.sectionKey ? ` · ${sectionLabel(m.sectionKey)}` : "";
      lines.push(`### ${ROLE_LABEL[m.authorRole]} · ${m.lockedAt.slice(11, 16)}${sec}`);
      lines.push("");
      lines.push(m.sourceMd.trim());
      lines.push("");
    }
    if (meeting.length === 0) lines.push("*(아직 대화 없음)*");
  } else {
    const releases = docId ? repo.listReleaseEntries(docId) : [];
    lines.push(`# ${project.title} — 릴리스 노트`);
    lines.push("");
    lines.push(`> SyncDoc 자동 생성 (합의·증류 스냅샷) · ${stamp} · ${releases.length}건`);
    lines.push("");
    for (const r of releases) {
      lines.push(`## ${r.versionLabel} — ${r.title ?? sectionLabel(r.sectionKey)}`);
      lines.push("");
      lines.push(`*${sectionLabel(r.sectionKey)} · ${fmtTs(r.createdAt)}*`);
      lines.push("");
      lines.push(r.bodyMd.trim());
      lines.push("");
    }
    if (releases.length === 0) lines.push("*(아직 합의된 결정 없음)*");
  }

  const md = lines.join("\n");
  const label = type === "minutes" ? "회의록" : "릴리스";
  const safeTitle = project.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 50);
  const filename = `${safeTitle}-${label}-${stamp.slice(0, 10)}.md`;

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
