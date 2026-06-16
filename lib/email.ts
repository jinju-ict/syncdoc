/**
 * 이메일 발송 (Resend HTTP API, 새 의존성 없음 — fetch 기반).
 * 미가입자 초대 시에만 사용한다. RESEND_API_KEY가 없으면 no-op(초대는 DB에만 기록).
 *
 * env:
 * - RESEND_API_KEY : Resend API 키 (없으면 메일 발송 생략)
 * - EMAIL_FROM     : 발신 주소 (기본 "SyncDoc <onboarding@resend.dev>")
 *                    임의 수신자에게 보내려면 Resend에서 도메인 인증 후 그 도메인 주소 사용
 * - APP_URL        : 배포 주소 (메일 속 가입 링크용, 예: https://syncdoc-….run.app)
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailResult = { ok: true } | { ok: false; error: string };

/** 메일 발송이 설정되어 있는지 (UI 토스트 문구 분기용) */
export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 미가입자에게 초대 메일 — "이 이메일로 가입하면 합류" 안내 + 링크 */
export async function sendInviteEmail(args: {
  to: string;
  projectTitle: string;
  inviterName: string;
}): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY 미설정 — 메일 생략" };

  const from = process.env.EMAIL_FROM || "SyncDoc <onboarding@resend.dev>";
  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
  const ctaUrl = appUrl ? `${appUrl}/start` : "";
  const project = escapeHtml(args.projectTitle);
  const inviter = escapeHtml(args.inviterName);
  const to = escapeHtml(args.to);

  const button = ctaUrl
    ? `<p style="margin:24px 0"><a href="${ctaUrl}" style="background:#2D4FD4;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">SyncDoc에서 가입하고 합류</a></p>
       <p style="font-size:13px;color:#8A857A">또는 이 주소로 접속: <a href="${ctaUrl}">${ctaUrl}</a></p>`
    : `<p style="font-size:13px;color:#8A857A">SyncDoc에 <b>${to}</b> 이메일로 가입하면 "받은 초대"에서 수락할 수 있습니다.</p>`;

  const html = `<div style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:480px;margin:0 auto;color:#1A1C20">
    <h2 style="font-size:18px;margin:0 0 4px">SyncDoc 초대</h2>
    <p style="font-size:14px;line-height:1.6;color:#4A463E"><b>${inviter}</b>님이 <b>"${project}"</b> 프로젝트에 초대했습니다.</p>
    <p style="font-size:14px;line-height:1.6;color:#4A463E">아래에서 <b>${to}</b> 이메일로 가입하면, "받은 초대"에서 바로 수락하고 협업할 수 있어요.</p>
    ${button}
    <hr style="border:0;border-top:1px solid #EAE7DF;margin:24px 0"/>
    <p style="font-size:12px;color:#B0AB9F">이 초대가 익숙하지 않다면 무시하셔도 됩니다.</p>
  </div>`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: `[SyncDoc] ${args.inviterName}님이 "${args.projectTitle}"에 초대했어요`,
        html,
      }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: `Resend 오류 (HTTP ${res.status}): ${body}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
