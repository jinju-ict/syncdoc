import StartShell from "@/components/StartShell";
import * as repo from "@/lib/repo";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 시작 셸 — 디자인 핸드오프 `SyncDoc Start.dc.html`을 실제 백엔드에 연동.
 * 세션이 있으면 그 사용자의 프로젝트·받은 초대를 DB에서 읽어 내려준다.
 * "문서 열기"는 프로젝트의 실제 메인 문서(/doc/[id])로 연결된다.
 */
export default async function StartPage() {
  const session = await getSession();
  const acct = session ? repo.getUserById(session.uid) : null;

  if (!session || !acct) {
    return <StartShell account={null} projects={[]} invites={[]} />;
  }

  const projects = repo
    .listProjectsForUser(session.uid)
    .map((s) => repo.getProjectForUser(s.id, session.uid))
    .filter((p): p is repo.ProjectDetail => p !== null);
  const invites = acct.email ? repo.listInvitesForEmail(acct.email) : [];

  return (
    <StartShell
      account={{ name: repo.accountDisplayName(acct), email: acct.email ?? "" }}
      projects={projects}
      invites={invites}
    />
  );
}
