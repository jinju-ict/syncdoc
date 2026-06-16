/**
 * UI 라벨 다국어 — 로그인 후 화면 전반. (콘텐츠 본문은 AI 번역, 여기는 고정 라벨)
 * client·server 공용 — 서버 전용 의존성 없음.
 */

import type { Lang } from "./schema";
import type { ProjectRole, Permission } from "./schema";

type Key =
  // 문서 렌즈/리더 (대화 + 백서)
  | "lens.paper" | "lens.conv"
  | "toc" | "agreementStatus" | "continueConversation" | "startDiscussion"
  | "notWritten" | "export"
  | "status" | "agreement" | "createdAt" | "members"
  | "agreed" | "discussing" | "draft" | "noAgreementItems"
  | "perspectiveSuffix"
  // 기록(회의록/릴리스)
  | "rec.heading" | "rec.headingSub" | "rec.minutes" | "rec.minutesSub"
  | "rec.releases" | "rec.releasesSub" | "rec.minutesEmpty" | "rec.releasesEmpty"
  | "rec.backProject" | "rec.count"
  // 프로젝트 워크스페이스
  | "pj.back" | "pj.myRole" | "pj.myPerm" | "pj.whitepaper" | "pj.records"
  | "pj.recordsAuto" | "pj.recMinutesDesc" | "pj.recReleasesDesc"
  | "pj.view" | "pj.exportMd" | "pj.empty" | "pj.ownerCanManage"
  | "pj.pending" | "pj.cancel"
  // 입장 승인 (join requests)
  | "join.requests" | "join.approve" | "join.reject" | "join.requestTitle"
  | "join.requestDesc" | "join.message" | "join.messagePh" | "join.submit"
  | "join.pendingMine" | "join.rejectedMine" | "join.private" | "join.backHome"
  | "join.sent"
  // 멤버/초대
  | "mem.invite" | "mem.email" | "mem.role" | "mem.perm" | "mem.send"
  | "mem.added" | "mem.sent" | "mem.needEmail" | "mem.removeConfirm" | "mem.me"
  | "mem.emailed" | "mem.recorded"
  // 인증 (로그인/회원가입)
  | "auth.tagline" | "auth.loginTitle" | "auth.signupTitle" | "auth.name"
  | "auth.email" | "auth.password" | "auth.signupStart" | "auth.haveAccount"
  | "auth.toLogin" | "auth.loginBtn" | "auth.firstTime" | "auth.toSignup" | "auth.demo"
  // 홈/생성 (StartShell)
  | "home.myProjects" | "home.newProject" | "home.received" | "home.accept"
  | "home.decline" | "home.openDoc" | "home.openChat" | "home.manage"
  | "home.memberCount" | "home.noProjects"
  | "create.title" | "create.titlePh" | "create.myRole" | "create.make"
  | "share.title" | "share.sub" | "share.copy" | "share.copied"
  | "nav.invites" | "nav.logout"
  | "toast.created" | "toast.joined" | "toast.noOwnerPerm"
  // 역할/권한/타입
  | "role.planner" | "role.developer" | "role.designer" | "role.ops"
  | "roleName.planner" | "roleName.developer" | "roleName.designer" | "roleName.ops"
  | "perm.owner" | "perm.editor" | "perm.viewer" | "perm.link"
  | "perm.editorDesc" | "perm.viewerDesc" | "perm.linkDesc"
  | "type.project";

const DICT: Record<Lang, Record<Key, string>> = {
  ko: {
    "lens.paper": "백서", "lens.conv": "대화",
    toc: "목차", agreementStatus: "합의 현황", continueConversation: "대화 이어가기", startDiscussion: "논의 시작",
    notWritten: "아직 작성 전입니다. 대화에서 이 주제를 논의하면 합의된 내용이 여기에 채워집니다.",
    export: "내보내기", status: "상태", agreement: "합의", createdAt: "생성일", members: "팀원",
    agreed: "합의됨", discussing: "논의 중", draft: "초안", noAgreementItems: "아직 합의할 항목이 없습니다.",
    perspectiveSuffix: "시점",
    "rec.heading": "기록", "rec.headingSub": "백서 대화에서 자동 생성됩니다 — 따로 작성하지 않습니다.",
    "rec.minutes": "회의록", "rec.minutesSub": "대화를 날짜별로 정리",
    "rec.releases": "릴리스", "rec.releasesSub": "합의·증류 시점의 결정 스냅샷",
    "rec.minutesEmpty": "아직 대화가 없습니다. 백서에서 논의를 시작하면 여기에 회의록이 쌓입니다.",
    "rec.releasesEmpty": "아직 합의된 결정이 없습니다. 대화가 쌓이면 AI가 백서를 갱신하면서 그 시점의 결정이 릴리스로 기록됩니다.",
    "rec.backProject": "← 프로젝트", "rec.count": "건",
    "pj.back": "← 내 프로젝트", "pj.myRole": "내 직군", "pj.myPerm": "내 권한",
    "pj.whitepaper": "백서", "pj.records": "기록", "pj.recordsAuto": "대화에서 자동 생성",
    "pj.recMinutesDesc": "대화를 날짜별로 정리한 회의 기록", "pj.recReleasesDesc": "합의·증류될 때마다 박제되는 결정 노트",
    "pj.view": "보기", "pj.exportMd": ".md 내보내기", "pj.empty": "아직 없습니다.",
    "pj.ownerCanManage": "· 직군·권한 변경/제거 가능", "pj.pending": "대기 중 초대", "pj.cancel": "취소",
    "join.requests": "입장 요청", "join.approve": "승인", "join.reject": "거절",
    "join.requestTitle": "이 채팅방에 입장 요청", "join.requestDesc": "직군을 선택해 입장을 요청하면 소유자 승인 후 합류합니다.",
    "join.message": "메시지(선택)", "join.messagePh": "간단한 소개나 입장 사유를 적어주세요",
    "join.submit": "입장 요청 보내기", "join.sent": "입장 요청을 보냈습니다",
    "join.pendingMine": "입장 요청을 보냈습니다. 소유자 승인을 기다리는 중입니다.",
    "join.rejectedMine": "입장 요청이 거절되었습니다.", "join.private": "비공개 채팅방입니다. 초대를 통해서만 참여할 수 있습니다.",
    "join.backHome": "← 내 프로젝트",
    "mem.invite": "팀원 초대", "mem.email": "이메일", "mem.role": "직군", "mem.perm": "권한", "mem.send": "초대 보내기",
    "mem.added": "팀원을 추가했어요", "mem.sent": "초대를 보냈어요", "mem.needEmail": "이메일을 입력하세요",
    "mem.removeConfirm": "님을 프로젝트에서 제거할까요?", "mem.me": "(나)",
    "mem.emailed": "초대 메일을 보냈어요", "mem.recorded": "초대를 기록했어요 (상대가 같은 이메일로 가입하면 보여요)",
    "home.myProjects": "내 프로젝트", "home.newProject": "새 프로젝트", "home.received": "받은 초대",
    "home.accept": "수락", "home.decline": "거절", "home.openDoc": "문서 열기", "home.memberCount": "멤버",
    "home.noProjects": "아직 프로젝트가 없습니다. 오른쪽 위 새 프로젝트로 시작하세요.",
    "create.title": "새 프로젝트", "create.titlePh": "예: 팝업스토어 오픈 프로젝트", "create.myRole": "이 프로젝트에서 내 직군", "create.make": "프로젝트 만들기",
    "share.title": "링크 공유 뷰어", "share.sub": "링크가 있으면 누구나 읽기", "share.copy": "복사",
    "nav.invites": "받은 초대", "nav.logout": "로그아웃",
    "auth.tagline": "하나의 문서, 모든 직군 — 각자의 언어로.",
    "auth.loginTitle": "로그인", "auth.signupTitle": "회원가입",
    "auth.name": "이름", "auth.email": "이메일", "auth.password": "비밀번호",
    "auth.signupStart": "가입하고 시작", "auth.haveAccount": "이미 계정이 있으신가요?", "auth.toLogin": "로그인",
    "auth.loginBtn": "로그인", "auth.firstTime": "처음이신가요?", "auth.toSignup": "회원가입",
    "auth.demo": "데모: mina@team.co · jun@team.co · sora@team.co (비밀번호 demo1234)",
    "home.openChat": "대화 열기", "home.manage": "관리", "share.copied": "링크를 복사했어요",
    "toast.created": "프로젝트를 만들었어요", "toast.joined": "프로젝트에 합류했어요", "toast.noOwnerPerm": "변경 권한이 없습니다 (소유자만 가능)",
    "perm.editorDesc": "작성·합의·서명", "perm.viewerDesc": "초대된 사람만 읽기·댓글", "perm.linkDesc": "링크가 있으면 누구나 읽기",
    "role.planner": "기획", "role.developer": "개발", "role.designer": "디자인", "role.ops": "운영",
    "roleName.planner": "기획자", "roleName.developer": "개발자", "roleName.designer": "디자이너", "roleName.ops": "운영자",
    "perm.owner": "소유자", "perm.editor": "편집자", "perm.viewer": "제한된 뷰어", "perm.link": "링크 뷰어",
    "type.project": "프로젝트",
  },
  en: {
    "lens.paper": "Whitepaper", "lens.conv": "Conversation",
    toc: "Contents", agreementStatus: "Agreement", continueConversation: "Continue conversation", startDiscussion: "Start discussion",
    notWritten: "Not written yet. Once this topic is discussed and agreed in the conversation, it will appear here.",
    export: "Export", status: "Status", agreement: "Agreement", createdAt: "Created", members: "Members",
    agreed: "Agreed", discussing: "In discussion", draft: "Draft", noAgreementItems: "No items to agree on yet.",
    perspectiveSuffix: "view",
    "rec.heading": "Records", "rec.headingSub": "Auto-generated from the whitepaper conversation — not written separately.",
    "rec.minutes": "Minutes", "rec.minutesSub": "Conversation organized by date",
    "rec.releases": "Releases", "rec.releasesSub": "Decision snapshots at each agreement",
    "rec.minutesEmpty": "No conversation yet. Once you start discussing in the whitepaper, minutes accumulate here.",
    "rec.releasesEmpty": "No agreed decisions yet. As the conversation builds, the AI updates the whitepaper and snapshots each change as a release.",
    "rec.backProject": "← Project", "rec.count": "",
    "pj.back": "← My projects", "pj.myRole": "My role", "pj.myPerm": "My permission",
    "pj.whitepaper": "Whitepaper", "pj.records": "Records", "pj.recordsAuto": "auto-generated from conversation",
    "pj.recMinutesDesc": "Meeting record organized by date", "pj.recReleasesDesc": "Decision notes captured on each agreement",
    "pj.view": "View", "pj.exportMd": "Export .md", "pj.empty": "Nothing yet.",
    "pj.ownerCanManage": "· can change role/permission, remove", "pj.pending": "Pending invites", "pj.cancel": "Cancel",
    "join.requests": "Join requests", "join.approve": "Approve", "join.reject": "Reject",
    "join.requestTitle": "Request to join this room", "join.requestDesc": "Pick your role and request to join; you're added after the owner approves.",
    "join.message": "Message (optional)", "join.messagePh": "Introduce yourself or say why you'd like to join",
    "join.submit": "Send join request", "join.sent": "Join request sent",
    "join.pendingMine": "Your join request was sent. Waiting for the owner to approve.",
    "join.rejectedMine": "Your join request was rejected.", "join.private": "This is a private room. You can only join by invitation.",
    "join.backHome": "← My projects",
    "mem.invite": "Invite member", "mem.email": "Email", "mem.role": "Role", "mem.perm": "Permission", "mem.send": "Send invite",
    "mem.added": "Member added", "mem.sent": "Invite sent", "mem.needEmail": "Enter an email",
    "mem.removeConfirm": " — remove from the project?", "mem.me": "(you)",
    "mem.emailed": "Invite email sent", "mem.recorded": "Invite saved (shows once they sign up with that email)",
    "home.myProjects": "My projects", "home.newProject": "New project", "home.received": "Received invites",
    "home.accept": "Accept", "home.decline": "Decline", "home.openDoc": "Open document", "home.memberCount": "members",
    "home.noProjects": "No projects yet. Start one with New project at the top right.",
    "create.title": "New project", "create.titlePh": "e.g. Pop-up store launch", "create.myRole": "My role in this project", "create.make": "Create project",
    "share.title": "Link-share viewer", "share.sub": "Anyone with the link can read", "share.copy": "Copy",
    "nav.invites": "Received invites", "nav.logout": "Log out",
    "auth.tagline": "One document, every role — each in their own language.",
    "auth.loginTitle": "Log in", "auth.signupTitle": "Sign up",
    "auth.name": "Name", "auth.email": "Email", "auth.password": "Password",
    "auth.signupStart": "Sign up & start", "auth.haveAccount": "Already have an account?", "auth.toLogin": "Log in",
    "auth.loginBtn": "Log in", "auth.firstTime": "First time here?", "auth.toSignup": "Sign up",
    "auth.demo": "Demo: mina@team.co · jun@team.co · sora@team.co (password demo1234)",
    "home.openChat": "Open chat", "home.manage": "Manage", "share.copied": "Link copied",
    "toast.created": "Project created", "toast.joined": "Joined the project", "toast.noOwnerPerm": "No permission (owner only)",
    "perm.editorDesc": "write · agree · sign", "perm.viewerDesc": "invited only: read · comment", "perm.linkDesc": "anyone with the link can read",
    "role.planner": "Planning", "role.developer": "Dev", "role.designer": "Design", "role.ops": "Ops",
    "roleName.planner": "Planner", "roleName.developer": "Developer", "roleName.designer": "Designer", "roleName.ops": "Ops",
    "perm.owner": "Owner", "perm.editor": "Editor", "perm.viewer": "Restricted viewer", "perm.link": "Link viewer",
    "type.project": "Project",
  },
  ja: {
    "lens.paper": "白書", "lens.conv": "会話",
    toc: "目次", agreementStatus: "合意状況", continueConversation: "会話を続ける", startDiscussion: "議論を開始",
    notWritten: "まだ未作成です。会話でこのテーマを議論し合意すると、ここに反映されます。",
    export: "エクスポート", status: "ステータス", agreement: "合意", createdAt: "作成日", members: "メンバー",
    agreed: "合意済み", discussing: "議論中", draft: "下書き", noAgreementItems: "まだ合意する項目がありません。",
    perspectiveSuffix: "視点",
    "rec.heading": "記録", "rec.headingSub": "白書の会話から自動生成されます — 別途作成しません。",
    "rec.minutes": "議事録", "rec.minutesSub": "会話を日付ごとに整理",
    "rec.releases": "リリース", "rec.releasesSub": "合意・蒸留時点の決定スナップショット",
    "rec.minutesEmpty": "まだ会話がありません。白書で議論を始めると、ここに議事録が蓄積されます。",
    "rec.releasesEmpty": "まだ合意された決定がありません。会話が蓄積されるとAIが白書を更新し、その時点の決定がリリースとして記録されます。",
    "rec.backProject": "← プロジェクト", "rec.count": "件",
    "pj.back": "← マイプロジェクト", "pj.myRole": "自分の職種", "pj.myPerm": "自分の権限",
    "pj.whitepaper": "白書", "pj.records": "記録", "pj.recordsAuto": "会話から自動生成",
    "pj.recMinutesDesc": "会話を日付ごとに整理した会議記録", "pj.recReleasesDesc": "合意・蒸留のたびに記録される決定ノート",
    "pj.view": "表示", "pj.exportMd": ".md エクスポート", "pj.empty": "まだありません。",
    "pj.ownerCanManage": "· 職種・権限の変更/削除が可能", "pj.pending": "保留中の招待", "pj.cancel": "取消",
    "join.requests": "入室リクエスト", "join.approve": "承認", "join.reject": "却下",
    "join.requestTitle": "このルームへの入室リクエスト", "join.requestDesc": "職種を選んで入室をリクエストすると、オーナーの承認後に参加できます。",
    "join.message": "メッセージ（任意）", "join.messagePh": "簡単な自己紹介や入室理由を書いてください",
    "join.submit": "入室リクエストを送る", "join.sent": "入室リクエストを送りました",
    "join.pendingMine": "入室リクエストを送りました。オーナーの承認待ちです。",
    "join.rejectedMine": "入室リクエストが却下されました。", "join.private": "非公開ルームです。招待からのみ参加できます。",
    "join.backHome": "← マイプロジェクト",
    "mem.invite": "メンバー招待", "mem.email": "メール", "mem.role": "職種", "mem.perm": "権限", "mem.send": "招待を送る",
    "mem.added": "メンバーを追加しました", "mem.sent": "招待を送りました", "mem.needEmail": "メールを入力してください",
    "mem.removeConfirm": "さんをプロジェクトから削除しますか？", "mem.me": "（自分）",
    "mem.emailed": "招待メールを送りました", "mem.recorded": "招待を記録しました（相手が同じメールで登録すると表示）",
    "home.myProjects": "マイプロジェクト", "home.newProject": "新規プロジェクト", "home.received": "受け取った招待",
    "home.accept": "承認", "home.decline": "辞退", "home.openDoc": "ドキュメントを開く", "home.memberCount": "メンバー",
    "home.noProjects": "まだプロジェクトがありません。右上の新規プロジェクトから始めましょう。",
    "create.title": "新規プロジェクト", "create.titlePh": "例：ポップアップストア立ち上げ", "create.myRole": "このプロジェクトでの自分の職種", "create.make": "プロジェクトを作成",
    "share.title": "リンク共有ビューア", "share.sub": "リンクがあれば誰でも閲覧可", "share.copy": "コピー",
    "nav.invites": "受け取った招待", "nav.logout": "ログアウト",
    "auth.tagline": "ひとつの文書、すべての職種 — それぞれの言語で。",
    "auth.loginTitle": "ログイン", "auth.signupTitle": "新規登録",
    "auth.name": "名前", "auth.email": "メール", "auth.password": "パスワード",
    "auth.signupStart": "登録して開始", "auth.haveAccount": "すでにアカウントをお持ちですか？", "auth.toLogin": "ログイン",
    "auth.loginBtn": "ログイン", "auth.firstTime": "はじめてですか？", "auth.toSignup": "新規登録",
    "auth.demo": "デモ: mina@team.co · jun@team.co · sora@team.co (パスワード demo1234)",
    "home.openChat": "会話を開く", "home.manage": "管理", "share.copied": "リンクをコピーしました",
    "toast.created": "プロジェクトを作成しました", "toast.joined": "プロジェクトに参加しました", "toast.noOwnerPerm": "変更権限がありません（オーナーのみ）",
    "perm.editorDesc": "作成・合意・署名", "perm.viewerDesc": "招待された人のみ閲覧・コメント", "perm.linkDesc": "リンクがあれば誰でも閲覧",
    "role.planner": "企画", "role.developer": "開発", "role.designer": "デザイン", "role.ops": "運用",
    "roleName.planner": "企画者", "roleName.developer": "開発者", "roleName.designer": "デザイナー", "roleName.ops": "運用者",
    "perm.owner": "オーナー", "perm.editor": "編集者", "perm.viewer": "制限付きビューア", "perm.link": "リンクビューア",
    "type.project": "プロジェクト",
  },
};

export function t(lang: Lang, key: Key): string {
  return DICT[lang]?.[key] ?? DICT.ko[key];
}

export function roleLabelL(role: ProjectRole, lang: Lang): string {
  return t(lang, `role.${role}` as Key);
}
export function roleNameL(role: ProjectRole, lang: Lang): string {
  return t(lang, `roleName.${role}` as Key);
}
export function permLabelL(perm: Permission, lang: Lang): string {
  return t(lang, `perm.${perm}` as Key);
}
