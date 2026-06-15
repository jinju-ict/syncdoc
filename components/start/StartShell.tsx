"use client";

/**
 * SyncDoc 시작 셸 — 디자인 핸드오프 `SyncDoc Start.dc.html`의 실데이터 구현.
 *
 * 화면: 로그인/회원가입 → 홈(내 프로젝트·받은 초대) → 프로젝트 생성 →
 *       프로젝트 상세(팀원·초대·링크 공유) → "문서 열기"(실제 문서로 이동).
 *
 * 데이터는 서버(page.tsx)에서 props로 내려오고, 변경은 서버 액션 후
 * router.refresh()로 재동기화한다. 화면 전환·폼 입력만 클라이언트 상태다.
 * 인라인 스타일 값은 원본 프로토타입과 1:1로 맞췄다(픽셀 동등).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type {
  InviteInfo,
  Lang,
  MemberInfo,
  Permission,
  ProjectDetail,
  ProjectRole,
} from "@/lib/repo";
import {
  acceptInviteAction,
  createProjectAction,
  declineInviteAction,
  inviteAction,
  loginEmail,
  logoutToStart,
  signup,
  toggleLinkAction,
} from "@/app/start/actions";
import { t, roleLabelL, roleNameL, permLabelL } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// 도메인 상수 — 라벨은 i18n(roleLabelL/roleNameL/permLabelL), 여기는 색상만.
// ---------------------------------------------------------------------------

const ROLE: Record<ProjectRole, { c: string; bg: string }> = {
  planner: { c: "#6D4FC8", bg: "#F1EDFB" },
  developer: { c: "#0D7E74", bg: "#E6F4F2" },
  designer: { c: "#C2410C", bg: "#FBEEE4" },
  ops: { c: "#2D6FB0", bg: "#E7F0F8" },
};

const FONT = "var(--font-instrument), 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const MONO = "var(--font-jetbrains), monospace";

type Screen = "login" | "signup" | "home" | "create" | "project";
type Account = { name: string; email: string };

// ---------------------------------------------------------------------------
// 공용 스타일
// ---------------------------------------------------------------------------

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #E0DCD2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  outlineColor: "#2D4FD4",
};
const primaryBtn: CSSProperties = {
  width: "100%",
  background: "#2D4FD4",
  color: "#fff",
  border: 0,
  borderRadius: 11,
  padding: "12px 0",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: "0 3px 0 #1F3680",
};
const linkBtn: CSSProperties = {
  background: "none",
  border: 0,
  color: "#2D4FD4",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 13,
  padding: 0,
};
const backBtn: CSSProperties = {
  background: "none",
  border: 0,
  color: "#8A857A",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  padding: 0,
};
const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#6E6A60",
  marginBottom: 6,
};

function roleChip(role: ProjectRole): CSSProperties {
  const r = ROLE[role];
  return {
    display: "inline-flex",
    alignItems: "center",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 99,
    padding: "2px 9px",
    color: r.c,
    background: r.bg,
    border: "1px solid " + r.c + "33",
  };
}
function seg(active: boolean, pos: "l" | "m" | "r"): CSSProperties {
  return {
    fontFamily: "inherit",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 600,
    padding: "7px 12px",
    border: "1px solid " + (active ? "#C9D6F6" : "#E0DCD2"),
    background: active ? "#EDF1FE" : "#fff",
    color: active ? "#2D4FD4" : "#6E6A60",
    borderRadius: pos === "l" ? "9px 0 0 9px" : pos === "r" ? "0 9px 9px 0" : "0",
    marginInlineStart: pos === "l" ? 0 : -1,
    flex: 1,
    position: "relative",
    zIndex: active ? 1 : 0,
  };
}

const ROLE_ORDER: ProjectRole[] = ["planner", "developer", "designer", "ops"];
const PERM_DEFS: { id: Permission; descKey: "perm.editorDesc" | "perm.viewerDesc" | "perm.linkDesc" }[] = [
  { id: "editor", descKey: "perm.editorDesc" },
  { id: "viewer", descKey: "perm.viewerDesc" },
  { id: "link", descKey: "perm.linkDesc" },
];

// ---------------------------------------------------------------------------
// 아이콘
// ---------------------------------------------------------------------------

const Book = ({ size = 17, stroke = "#fff" }: { size?: number; stroke?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);
const Plus = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);
const Chevron = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#9A958A" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const Send = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6E6A60" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4z" />
  </svg>
);
const LogoutIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6E6A60" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

export default function StartShell({
  account,
  projects,
  invites,
  lang: initialLang = "ko",
}: {
  account: Account | null;
  projects: ProjectDetail[];
  invites: InviteInfo[];
  lang?: Lang;
}) {
  const router = useRouter();
  const authed = account !== null;

  // UI 언어 — 로그인 사용자는 설정값, 로그아웃 화면은 스위처로 전환(세션 한정).
  const [lang, setLang] = useState<Lang>(initialLang);
  const tt = (k: Parameters<typeof t>[1]) => t(lang, k);

  const [screen, setScreen] = useState<Screen>(authed ? "home" : "login");
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPw, setSuPw] = useState("");
  const [liEmail, setLiEmail] = useState("");
  const [liPw, setLiPw] = useState("");
  const [cur, setCur] = useState<number | null>(null);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [cpTitle, setCpTitle] = useState("");
  const [cpRole, setCpRole] = useState<ProjectRole>("planner");
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<ProjectRole>("developer");
  const [invPerm, setInvPerm] = useState<Permission>("editor");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // 로그인 경계가 바뀌면(로그인/로그아웃) 화면을 기본값으로 되돌린다
  const prevAuthed = useRef(authed);
  useEffect(() => {
    if (prevAuthed.current !== authed) {
      setScreen(authed ? "home" : "login");
      setHeaderMenu(false);
      prevAuthed.current = authed;
    }
  }, [authed]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  function showToast(m: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(m);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  const curProject = projects.find((p) => p.id === cur) ?? null;
  const isAuth = !authed && (screen === "login" || screen === "signup");
  const isApp = authed && (screen === "home" || screen === "create" || screen === "project");

  // ---- 핸들러 ----
  const goLogin = () => setScreen("login");
  const goSignup = () => setScreen("signup");
  const goHome = () => setScreen("home");

  async function doSignup() {
    if (pending) return;
    if (!suEmail.trim()) { showToast(tt("mem.needEmail")); return; }
    setPending(true);
    const r = await signup({ name: suName, email: suEmail, password: suPw });
    setPending(false);
    if (!r.ok) { showToast(r.error); return; }
    router.refresh(); // account prop 도착 → effect가 home으로 전환
  }
  async function doLogin() {
    if (pending) return;
    if (!liEmail.trim()) { showToast(tt("mem.needEmail")); return; }
    setPending(true);
    const r = await loginEmail({ email: liEmail, password: liPw });
    setPending(false);
    if (!r.ok) { showToast(r.error); return; }
    router.refresh();
  }
  async function doCreate() {
    if (pending) return;
    setPending(true);
    const r = await createProjectAction({ title: cpTitle, role: cpRole });
    setPending(false);
    if (!r.ok) { showToast(r.error); return; }
    setCur(r.data.projectId);
    setScreen("project");
    router.refresh();
    showToast(tt("toast.created"));
  }
  async function doInvite() {
    if (pending || cur == null) return;
    if (!invEmail.trim()) { showToast(tt("mem.needEmail")); return; }
    setPending(true);
    const r = await inviteAction({ projectId: cur, email: invEmail, role: invRole, perm: invPerm });
    setPending(false);
    if (!r.ok) { showToast(r.error); return; }
    setInvEmail("");
    router.refresh();
    showToast(r.data.added ? tt("mem.added") : tt("mem.sent"));
  }
  async function doAccept(iv: InviteInfo) {
    if (pending) return;
    setPending(true);
    const r = await acceptInviteAction({ inviteId: iv.id });
    setPending(false);
    if (!r.ok) { showToast(r.error); return; }
    setCur(r.data.projectId);
    setScreen("project");
    router.refresh();
    showToast(tt("toast.joined"));
  }
  async function doDecline(iv: InviteInfo) {
    if (pending) return;
    setPending(true);
    await declineInviteAction({ inviteId: iv.id });
    setPending(false);
    router.refresh();
  }
  async function doToggleLink() {
    if (pending || !curProject) return;
    if (curProject.myPerm !== "owner") { showToast(tt("toast.noOwnerPerm")); return; }
    setPending(true);
    const r = await toggleLinkAction({ projectId: curProject.id, shared: !curProject.linkShared });
    setPending(false);
    if (!r.ok) { showToast(r.error); return; }
    router.refresh();
  }
  function onCopyLink() {
    if (!curProject) return;
    try {
      navigator.clipboard.writeText("https://syncdoc.io/d/" + curProject.id + "?view=link");
    } catch {
      /* noop */
    }
    showToast(tt("share.copied"));
  }
  function onOpenDoc() {
    if (!curProject) return;
    // 프로젝트를 열면 바로 대화창(채팅)으로 — 관리 화면은 채팅 헤더의 프로젝트 링크로
    if (curProject.mainDocId) router.push(`/doc/${curProject.mainDocId}?lens=conv`);
    else router.push(`/project/${curProject.id}`);
  }
  function openProjectChat(p: ProjectDetail) {
    // 프로젝트 클릭 = 대화창으로 직행
    if (p.mainDocId) router.push(`/doc/${p.mainDocId}?lens=conv`);
    else { setCur(p.id); setScreen("project"); }
  }
  function manageProject(p: ProjectDetail) {
    // 팀원·초대·링크 공유 관리 화면
    setCur(p.id);
    setScreen("project");
  }
  function openCreate() {
    setScreen("create");
    setCpTitle("");
    setCpRole("planner");
  }

  const canInvite = curProject?.myPerm === "owner";
  const shareLink = curProject ? "https://syncdoc.io/d/" + curProject.id + "?view=link" : "";

  return (
    <div style={{ fontFamily: FONT, color: "#1A1C20", minHeight: "100vh", wordBreak: "keep-all", background: "#F6F5F2" }}>
      <style>{`
        .sd-scope * { box-sizing: border-box; }
        @keyframes sdIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .sd-primary:hover { background: #2440B0 !important; }
        .sd-card:hover { border-color: #C9D6F6 !important; box-shadow: 0 8px 20px -12px rgba(45,79,212,0.25) !important; }
        .sd-menuitem:hover { background: #F4F2EC !important; }
        .sd-profile:hover { border-color: #C9C3B5 !important; }
      `}</style>

      <div className="sd-scope">
        {/* ============ AUTH (login / signup) ============ */}
        {isAuth && (
          <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
            <div style={{ width: 420, maxWidth: "100%", background: "#fff", border: "1px solid #E9E6DE", borderRadius: 18, padding: 32, boxShadow: "0 24px 56px -30px rgba(40,36,26,0.35)", animation: "sdIn 0.2s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: "#2D4FD4", display: "grid", placeItems: "center" }}>
                  <Book />
                </span>
                <span style={{ fontSize: 18, fontWeight: 700 }}>SyncDoc</span>
              </div>
              <p style={{ fontSize: 13.5, color: "#8A857A", lineHeight: 1.6, margin: "0 0 14px" }}>
                {tt("auth.tagline")}
              </p>
              <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
                {(["ko", "en", "ja"] as const).map((lg) => (
                  <button
                    key={lg}
                    type="button"
                    onClick={() => setLang(lg)}
                    style={{ fontFamily: "inherit", cursor: "pointer", fontSize: 11, fontWeight: 600, borderRadius: 7, padding: "3px 9px", border: "1px solid " + (lang === lg ? "#C9D6F6" : "#E0DCD2"), background: lang === lg ? "#EDF1FE" : "#fff", color: lang === lg ? "#2D4FD4" : "#9A958A" }}
                  >
                    {lg === "ko" ? "한국어" : lg === "en" ? "English" : "日本語"}
                  </button>
                ))}
              </div>

              {screen === "signup" ? (
                <>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>{tt("auth.signupTitle")}</p>
                  <label style={labelStyle}>{tt("auth.name")}</label>
                  <input value={suName} onChange={(e) => setSuName(e.target.value)} style={inputStyle} />
                  <label style={{ ...labelStyle, margin: "14px 0 6px" }}>{tt("auth.email")}</label>
                  <input value={suEmail} onChange={(e) => setSuEmail(e.target.value)} placeholder="name@team.co" style={inputStyle} />
                  <label style={{ ...labelStyle, margin: "14px 0 6px" }}>{tt("auth.password")}</label>
                  <input type="password" value={suPw} onChange={(e) => setSuPw(e.target.value)} placeholder="••••••••" style={inputStyle} />
                  <button className="sd-primary" onClick={doSignup} disabled={pending} style={{ ...primaryBtn, marginTop: 22, opacity: pending ? 0.7 : 1 }}>
                    {tt("auth.signupStart")}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 13, color: "#8A857A", margin: "16px 0 0" }}>
                    {tt("auth.haveAccount")} <button onClick={goLogin} style={linkBtn}>{tt("auth.toLogin")}</button>
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>{tt("auth.loginTitle")}</p>
                  <label style={labelStyle}>{tt("auth.email")}</label>
                  <input value={liEmail} onChange={(e) => setLiEmail(e.target.value)} placeholder="mina@team.co" style={inputStyle} />
                  <label style={{ ...labelStyle, margin: "14px 0 6px" }}>{tt("auth.password")}</label>
                  <input type="password" value={liPw} onChange={(e) => setLiPw(e.target.value)} placeholder="••••••••" style={inputStyle} />
                  <button className="sd-primary" onClick={doLogin} disabled={pending} style={{ ...primaryBtn, marginTop: 22, opacity: pending ? 0.7 : 1 }}>
                    {tt("auth.loginBtn")}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 13, color: "#8A857A", margin: "16px 0 0" }}>
                    {tt("auth.firstTime")} <button onClick={goSignup} style={linkBtn}>{tt("auth.toSignup")}</button>
                  </p>
                  <p style={{ textAlign: "center", fontSize: 11.5, color: "#9A958A", margin: "12px 0 0" }}>
                    {tt("auth.demo")}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ============ APP CHROME (home / create / project) ============ */}
        {isApp && account && (
          <>
            <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(246,245,242,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid #E6E3DC" }}>
              <div style={{ maxWidth: 1080, margin: "0 auto", height: 58, display: "flex", alignItems: "center", gap: 12, padding: "0 24px" }}>
                <button onClick={goHome} style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ width: 27, height: 27, borderRadius: 8, background: "#2D4FD4", display: "grid", placeItems: "center" }}>
                    <Book size={15} />
                  </span>
                  <span style={{ fontSize: 15.5, fontWeight: 700 }}>SyncDoc</span>
                </button>
                <span style={{ marginInlineStart: "auto", position: "relative" }}>
                  <button className="sd-profile" onClick={() => setHeaderMenu((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #E0DCD2", borderRadius: 99, padding: "4px 10px 4px 4px", cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ width: 28, height: 28, borderRadius: 99, background: "#2D4FD4", color: "#fff", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center" }}>
                      {(account.name || "U").trim().charAt(0)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#3C3A34" }}>{account.name}</span>
                    <Chevron />
                  </button>
                  {headerMenu && (
                    <div style={{ position: "absolute", top: 44, insetInlineEnd: 0, width: 232, background: "#fff", border: "1px solid #E6E3DC", borderRadius: 14, boxShadow: "0 12px 32px rgba(40,36,26,0.16)", padding: 14, zIndex: 40 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{account.name}</p>
                      <p style={{ fontSize: 11.5, color: "#2D4FD4", margin: "2px 0 12px", fontFamily: MONO }}>{account.email}</p>
                      <button className="sd-menuitem" onClick={() => { setScreen("home"); setHeaderMenu(false); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: 0, borderRadius: 9, padding: "8px 10px", fontSize: 13, color: "#3C3A34", cursor: "pointer", fontFamily: "inherit", textAlign: "start" }}>
                        <Send />{tt("nav.invites")}
                        <span style={{ marginInlineStart: "auto", fontSize: 11, fontWeight: 700, color: "#2D4FD4", background: "#EDF1FE", borderRadius: 99, padding: "1px 8px" }}>{invites.length}</span>
                      </button>
                      <form action={logoutToStart}>
                        <button type="submit" className="sd-menuitem" style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: 0, borderRadius: 9, padding: "8px 10px", fontSize: 13, color: "#3C3A34", cursor: "pointer", fontFamily: "inherit", textAlign: "start", marginTop: 2 }}>
                          <LogoutIcon />{tt("nav.logout")}
                        </button>
                      </form>
                    </div>
                  )}
                </span>
              </div>
            </header>

            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 80px" }}>
              {/* HOME */}
              {screen === "home" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                    <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>{tt("home.myProjects")}</h1>
                    <button className="sd-primary" onClick={openCreate} style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 7, background: "#2D4FD4", color: "#fff", border: 0, borderRadius: 11, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 0 #1F3680" }}>
                      <Plus />{tt("home.newProject")}
                    </button>
                  </div>

                  {projects.length === 0 ? (
                    <p style={{ border: "1px dashed #D7D2C6", borderRadius: 14, padding: "40px 0", textAlign: "center", fontSize: 13.5, color: "#9A958A", background: "#fff" }}>
                      {tt("home.noProjects")}
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {projects.map((p) => (
                        <div key={p.id} className="sd-card" style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", border: "1px solid #E9E6DE", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 2px rgba(40,36,26,0.04)" }}>
                          <button onClick={() => openProjectChat(p)} title={tt("home.openChat")} style={{ flex: 1, minWidth: 0, textAlign: "start", background: "none", border: 0, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 6 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.01em" }}>{p.title}</span>
                              <span style={roleChip(p.myRole)}>{roleLabelL(p.myRole, lang)}</span>
                            </span>
                            <span style={{ fontSize: 12.5, color: "#9A958A" }}>{permLabelL(p.myPerm, lang)} · {tt("home.memberCount")} {p.members.length}</span>
                          </button>
                          <button onClick={() => manageProject(p)} title={tt("home.manage")} style={{ flexShrink: 0, background: "#fff", border: "1px solid #E0DCD2", borderRadius: 9, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, color: "#6E6A60", cursor: "pointer", fontFamily: "inherit" }}>{tt("home.manage")}</button>
                          <button onClick={() => openProjectChat(p)} title={tt("home.openChat")} aria-label={tt("home.openChat")} style={{ flexShrink: 0, background: "#2D4FD4", border: 0, borderRadius: 10, width: 36, height: 36, display: "grid", placeItems: "center", cursor: "pointer" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5z" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {invites.length > 0 && (
                    <>
                      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958A", margin: "34px 0 12px" }}>{tt("home.received")}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {invites.map((iv) => (
                          <div key={iv.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #E9E6DE", borderRadius: 13, padding: "14px 18px" }}>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>{iv.title}</span>
                              <span style={{ display: "block", fontSize: 12.5, color: "#9A958A", marginTop: 2 }}>{iv.from} · {roleNameL(iv.role, lang)}</span>
                            </span>
                            <button className="sd-primary" onClick={() => doAccept(iv)} disabled={pending} style={{ marginInlineStart: "auto", background: "#2D4FD4", color: "#fff", border: 0, borderRadius: 9, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{tt("home.accept")}</button>
                            <button onClick={() => doDecline(iv)} disabled={pending} style={{ background: "none", border: 0, color: "#9A958A", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{tt("home.decline")}</button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* CREATE */}
              {screen === "create" && (
                <>
                  <button onClick={goHome} style={backBtn}>{tt("pj.back")}</button>
                  <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "14px 0 22px" }}>{tt("create.title")}</h1>
                  <div style={{ maxWidth: 520, background: "#fff", border: "1px solid #E9E6DE", borderRadius: 16, padding: 26 }}>
                    <label style={labelStyle}>{lang === "en" ? "Project title" : lang === "ja" ? "プロジェクト名" : "프로젝트 제목"}</label>
                    <input value={cpTitle} onChange={(e) => setCpTitle(e.target.value)} placeholder={tt("create.titlePh")} style={inputStyle} />
                    <label style={{ ...labelStyle, margin: "18px 0 6px" }}>{tt("create.myRole")}</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {ROLE_ORDER.map((id, i, a) => (
                        <button key={id} onClick={() => setCpRole(id)} style={seg(cpRole === id, i === 0 ? "l" : i === a.length - 1 ? "r" : "m")}>{roleLabelL(id, lang)}</button>
                      ))}
                    </div>
                    <button className="sd-primary" onClick={doCreate} disabled={pending} style={{ ...primaryBtn, marginTop: 24, opacity: pending ? 0.7 : 1 }}>{tt("create.make")}</button>
                  </div>
                </>
              )}

              {/* PROJECT */}
              {screen === "project" && curProject && (
                <>
                  <button onClick={goHome} style={backBtn}>{tt("pj.back")}</button>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 6px", flexWrap: "wrap" }}>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>{curProject.title}</h1>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#6E6A60", background: "#F4F2EC", borderRadius: 7, padding: "3px 9px" }}>{tt("type.project")}</span>
                    <button className="sd-primary" onClick={onOpenDoc} style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 7, background: "#2D4FD4", color: "#fff", border: 0, cursor: "pointer", fontFamily: "inherit", borderRadius: 11, padding: "10px 18px", fontSize: 14, fontWeight: 600, boxShadow: "0 3px 0 #1F3680" }}>
                      <Book size={15} />{tt("home.openDoc")}
                    </button>
                  </div>
                  <p style={{ fontSize: 13, color: "#9A958A", margin: "0 0 26px" }}>
                    {tt("pj.myRole")} <strong style={{ color: "#6E6A60" }}>{roleNameL(curProject.myRole, lang)}</strong> · {tt("pj.myPerm")} <strong style={{ color: "#6E6A60" }}>{permLabelL(curProject.myPerm, lang)}</strong>
                  </p>

                  <div className="sd-grid-detail">
                    {/* members */}
                    <div style={{ background: "#fff", border: "1px solid #E9E6DE", borderRadius: 16, padding: "20px 22px" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A958A", margin: "0 0 14px" }}>{tt("members")} {curProject.members.length}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {curProject.members.map((m: MemberInfo) => (
                          <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ width: 30, height: 30, borderRadius: 99, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, background: ROLE[m.role].bg, color: ROLE[m.role].c }}>
                              {(m.name || m.email).trim().charAt(0)}
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 }}>{m.name}</span>
                              <span style={{ display: "block", fontSize: 11, color: "#9A958A", fontFamily: MONO }}>{m.email}</span>
                            </span>
                            <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span style={roleChip(m.role)}>{roleLabelL(m.role, lang)}</span>
                              <span style={{ fontSize: 11.5, color: "#8A857A" }}>{permLabelL(m.perm, lang)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* invite + share */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {canInvite && (
                        <div style={{ background: "#fff", border: "1px solid #E9E6DE", borderRadius: 16, padding: "18px 20px" }}>
                          <p style={{ fontSize: 13.5, fontWeight: 700, margin: "0 0 12px" }}>{tt("mem.invite")}</p>
                          <input value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder={tt("mem.email")} style={inputStyle} />
                          <p style={{ fontSize: 11, fontWeight: 600, color: "#9A958A", margin: "14px 0 6px" }}>{tt("mem.role")}</p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {ROLE_ORDER.map((id, i, a) => (
                              <button key={id} onClick={() => setInvRole(id)} style={seg(invRole === id, i === 0 ? "l" : i === a.length - 1 ? "r" : "m")}>{roleLabelL(id, lang)}</button>
                            ))}
                          </div>
                          <p style={{ fontSize: 11, fontWeight: 600, color: "#9A958A", margin: "14px 0 6px" }}>{tt("mem.perm")}</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {PERM_DEFS.map(({ id, descKey }) => {
                              const active = invPerm === id;
                              return (
                                <button key={id} onClick={() => setInvPerm(id)} style={{ textAlign: "start", fontFamily: "inherit", cursor: "pointer", borderRadius: 9, padding: "9px 12px", border: "1px solid " + (active ? "#C9D6F6" : "#E0DCD2"), background: active ? "#EDF1FE" : "#fff", color: active ? "#2D4FD4" : "#3C3A34", fontSize: 12.5, fontWeight: 600 }}>
                                  {permLabelL(id, lang)}
                                  <span style={{ display: "block", fontSize: 11, fontWeight: 400, opacity: 0.8, marginTop: 1 }}>{tt(descKey)}</span>
                                </button>
                              );
                            })}
                          </div>
                          <button className="sd-primary" onClick={doInvite} disabled={pending} style={{ ...primaryBtn, marginTop: 16, opacity: pending ? 0.7 : 1 }}>{tt("mem.send")}</button>
                        </div>
                      )}

                      <div style={{ background: "#fff", border: "1px solid #E9E6DE", borderRadius: 16, padding: "18px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{tt("share.title")}</span>
                            <span style={{ display: "block", fontSize: 11.5, color: "#9A958A", marginTop: 2 }}>{tt("share.sub")}</span>
                          </span>
                          <button onClick={doToggleLink} disabled={!canInvite || pending} style={{ marginInlineStart: "auto", flexShrink: 0, width: 42, height: 24, borderRadius: 99, border: 0, cursor: canInvite ? "pointer" : "not-allowed", padding: 2, background: curProject.linkShared ? "#2D4FD4" : "#D7D2C6", display: "flex", justifyContent: curProject.linkShared ? "flex-end" : "flex-start", transition: "background 0.15s", opacity: canInvite ? 1 : 0.6 }}>
                            <span style={{ width: 20, height: 20, borderRadius: 99, background: "#fff", display: "block" }} />
                          </button>
                        </div>
                        {curProject.linkShared && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, background: "#F4F2EC", border: "1px solid #E6E3DC", borderRadius: 9, padding: "8px 11px" }}>
                            <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 11, color: "#6E6A60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shareLink}</span>
                            <button onClick={onCopyLink} style={{ flexShrink: 0, background: "#fff", border: "1px solid #E0DCD2", borderRadius: 7, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, color: "#6E6A60", cursor: "pointer", fontFamily: "inherit" }}>{tt("share.copy")}</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* TOAST */}
        {toast !== null && (
          <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "#1A1C20", color: "#fff", fontSize: 13, fontWeight: 500, borderRadius: 11, padding: "11px 20px", boxShadow: "0 8px 24px rgba(26,28,32,0.3)", animation: "sdIn 0.2s ease", zIndex: 60 }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
