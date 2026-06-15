/**
 * UI 라벨 다국어 — 로그인 후 화면 전반. (콘텐츠 본문은 AI 번역, 여기는 고정 라벨)
 * client·server 공용 — 서버 전용 의존성 없음.
 */

import type { Lang } from "./schema";
import type { ProjectRole, Permission } from "./schema";

type Key =
  // 문서 렌즈/리더
  | "lens.paper" | "lens.side" | "lens.conv" | "lens.data"
  | "toc" | "agreementStatus" | "continueConversation" | "startDiscussion"
  | "notWritten" | "distill" | "distilled" | "distilling"
  | "distillNone" | "distillCached" | "distillDone" | "export"
  | "docInfo" | "status" | "agreement" | "createdAt" | "members"
  | "agreed" | "discussing" | "draft" | "noAgreementItems"
  | "sectionConversation" | "perspectiveSuffix"
  // 데이터(RAG) 렌즈
  | "data.title" | "data.sub" | "data.query" | "data.clear" | "data.chunks"
  | "data.schema" | "data.qAgreed" | "data.qDiscussing" | "data.qEmpty" | "data.qCounts"
  | "kind.meta" | "kind.section" | "kind.empty"
  // 기록(회의록/릴리스)
  | "rec.heading" | "rec.headingSub" | "rec.minutes" | "rec.minutesSub"
  | "rec.releases" | "rec.releasesSub" | "rec.minutesEmpty" | "rec.releasesEmpty"
  | "rec.backProject" | "rec.count"
  // 프로젝트 워크스페이스
  | "pj.back" | "pj.myRole" | "pj.myPerm" | "pj.whitepaper" | "pj.records"
  | "pj.recordsAuto" | "pj.recMinutesDesc" | "pj.recReleasesDesc"
  | "pj.view" | "pj.exportMd" | "pj.empty" | "pj.ownerCanManage"
  | "pj.pending" | "pj.cancel"
  // 멤버/초대
  | "mem.invite" | "mem.email" | "mem.role" | "mem.perm" | "mem.send"
  | "mem.added" | "mem.sent" | "mem.needEmail" | "mem.removeConfirm" | "mem.me"
  // 홈/생성 (StartShell)
  | "home.myProjects" | "home.newProject" | "home.received" | "home.accept"
  | "home.decline" | "home.openDoc" | "home.memberCount" | "home.noProjects"
  | "create.title" | "create.titlePh" | "create.myRole" | "create.make"
  | "share.title" | "share.sub" | "share.copy"
  | "nav.invites" | "nav.logout"
  // 역할/권한/타입
  | "role.planner" | "role.developer" | "role.designer" | "role.ops"
  | "roleName.planner" | "roleName.developer" | "roleName.designer" | "roleName.ops"
  | "perm.owner" | "perm.editor" | "perm.viewer" | "perm.link"
  | "type.project";

const DICT: Record<Lang, Record<Key, string>> = {
  ko: {
    "lens.paper": "백서", "lens.side": "나란히", "lens.conv": "대화", "lens.data": "데이터",
    toc: "목차", agreementStatus: "합의 현황", continueConversation: "대화 이어가기", startDiscussion: "논의 시작",
    notWritten: "아직 작성 전입니다. 대화에서 이 주제를 논의하면 합의된 내용이 여기에 채워집니다.",
    distill: "백서에 반영 (증류)", distilled: "✓ 백서에 반영됨", distilling: "증류 중…",
    distillNone: "대화가 쌓이면 백서로 증류할 수 있어요", distillCached: "이미 최신입니다", distillDone: "백서에 반영했어요",
    export: "내보내기", docInfo: "문서 정보", status: "상태", agreement: "합의", createdAt: "생성일", members: "팀원",
    agreed: "합의됨", discussing: "논의 중", draft: "초안", noAgreementItems: "아직 합의할 항목이 없습니다.",
    sectionConversation: "대화", perspectiveSuffix: "시점",
    "data.title": "데이터 · RAG",
    "data.sub": "백서의 모든 절·항목이 안정 키와 상태를 가진 검색 가능한 청크가 됩니다. 표준 구조라 AI가 기계적으로 질의할 수 있습니다.",
    "data.query": "메타데이터 질의", "data.clear": "지우기", "data.chunks": "인덱싱 청크", "data.schema": "RAG 색인 스키마",
    "data.qAgreed": "합의된 항목은?", "data.qDiscussing": "논의 중인 항목은?", "data.qEmpty": "작성 전 절은?", "data.qCounts": "절별 항목 수는?",
    "kind.meta": "메타", "kind.section": "세부 항목", "kind.empty": "절(빈)",
    "rec.heading": "기록", "rec.headingSub": "백서 대화에서 자동 생성됩니다 — 따로 작성하지 않습니다.",
    "rec.minutes": "회의록", "rec.minutesSub": "대화를 날짜별로 정리",
    "rec.releases": "릴리스", "rec.releasesSub": "합의·증류 시점의 결정 스냅샷",
    "rec.minutesEmpty": "아직 대화가 없습니다. 백서에서 논의를 시작하면 여기에 회의록이 쌓입니다.",
    "rec.releasesEmpty": "아직 합의된 결정이 없습니다. 나란히 렌즈에서 \"백서에 반영(증류)\"하면 릴리스가 박제됩니다.",
    "rec.backProject": "← 프로젝트", "rec.count": "건",
    "pj.back": "← 내 프로젝트", "pj.myRole": "내 직군", "pj.myPerm": "내 권한",
    "pj.whitepaper": "백서", "pj.records": "기록", "pj.recordsAuto": "대화에서 자동 생성",
    "pj.recMinutesDesc": "대화를 날짜별로 정리한 회의 기록", "pj.recReleasesDesc": "합의·증류될 때마다 박제되는 결정 노트",
    "pj.view": "보기", "pj.exportMd": ".md 내보내기", "pj.empty": "아직 없습니다.",
    "pj.ownerCanManage": "· 직군·권한 변경/제거 가능", "pj.pending": "대기 중 초대", "pj.cancel": "취소",
    "mem.invite": "팀원 초대", "mem.email": "이메일", "mem.role": "직군", "mem.perm": "권한", "mem.send": "초대 보내기",
    "mem.added": "팀원을 추가했어요", "mem.sent": "초대를 보냈어요", "mem.needEmail": "이메일을 입력하세요",
    "mem.removeConfirm": "님을 프로젝트에서 제거할까요?", "mem.me": "(나)",
    "home.myProjects": "내 프로젝트", "home.newProject": "새 프로젝트", "home.received": "받은 초대",
    "home.accept": "수락", "home.decline": "거절", "home.openDoc": "문서 열기", "home.memberCount": "멤버",
    "home.noProjects": "아직 프로젝트가 없습니다. 오른쪽 위 새 프로젝트로 시작하세요.",
    "create.title": "새 프로젝트", "create.titlePh": "예: 팝업스토어 오픈 프로젝트", "create.myRole": "이 프로젝트에서 내 직군", "create.make": "프로젝트 만들기",
    "share.title": "링크 공유 뷰어", "share.sub": "링크가 있으면 누구나 읽기", "share.copy": "복사",
    "nav.invites": "받은 초대", "nav.logout": "로그아웃",
    "role.planner": "기획", "role.developer": "개발", "role.designer": "디자인", "role.ops": "운영",
    "roleName.planner": "기획자", "roleName.developer": "개발자", "roleName.designer": "디자이너", "roleName.ops": "운영자",
    "perm.owner": "소유자", "perm.editor": "편집자", "perm.viewer": "제한된 뷰어", "perm.link": "링크 뷰어",
    "type.project": "프로젝트",
  },
  en: {
    "lens.paper": "Whitepaper", "lens.side": "Side-by-side", "lens.conv": "Conversation", "lens.data": "Data",
    toc: "Contents", agreementStatus: "Agreement", continueConversation: "Continue conversation", startDiscussion: "Start discussion",
    notWritten: "Not written yet. Once this topic is discussed and agreed in the conversation, it will appear here.",
    distill: "Add to whitepaper (distill)", distilled: "✓ Added to whitepaper", distilling: "Distilling…",
    distillNone: "Distill into the whitepaper once a conversation builds up", distillCached: "Already up to date", distillDone: "Added to the whitepaper",
    export: "Export", docInfo: "Document info", status: "Status", agreement: "Agreement", createdAt: "Created", members: "Members",
    agreed: "Agreed", discussing: "In discussion", draft: "Draft", noAgreementItems: "No items to agree on yet.",
    sectionConversation: "Conversation", perspectiveSuffix: "view",
    "data.title": "Data · RAG",
    "data.sub": "Every section and item of the whitepaper becomes a searchable chunk with a stable key and status — a standard structure AI can query mechanically.",
    "data.query": "Metadata query", "data.clear": "Clear", "data.chunks": "Indexed chunks", "data.schema": "RAG index schema",
    "data.qAgreed": "Which items are agreed?", "data.qDiscussing": "Which are in discussion?", "data.qEmpty": "Which sections are empty?", "data.qCounts": "Items per section?",
    "kind.meta": "meta", "kind.section": "item", "kind.empty": "section (empty)",
    "rec.heading": "Records", "rec.headingSub": "Auto-generated from the whitepaper conversation — not written separately.",
    "rec.minutes": "Minutes", "rec.minutesSub": "Conversation organized by date",
    "rec.releases": "Releases", "rec.releasesSub": "Decision snapshots at each agreement",
    "rec.minutesEmpty": "No conversation yet. Once you start discussing in the whitepaper, minutes accumulate here.",
    "rec.releasesEmpty": "No agreed decisions yet. Use \"Add to whitepaper (distill)\" in the side-by-side lens to capture a release.",
    "rec.backProject": "← Project", "rec.count": "",
    "pj.back": "← My projects", "pj.myRole": "My role", "pj.myPerm": "My permission",
    "pj.whitepaper": "Whitepaper", "pj.records": "Records", "pj.recordsAuto": "auto-generated from conversation",
    "pj.recMinutesDesc": "Meeting record organized by date", "pj.recReleasesDesc": "Decision notes captured on each agreement",
    "pj.view": "View", "pj.exportMd": "Export .md", "pj.empty": "Nothing yet.",
    "pj.ownerCanManage": "· can change role/permission, remove", "pj.pending": "Pending invites", "pj.cancel": "Cancel",
    "mem.invite": "Invite member", "mem.email": "Email", "mem.role": "Role", "mem.perm": "Permission", "mem.send": "Send invite",
    "mem.added": "Member added", "mem.sent": "Invite sent", "mem.needEmail": "Enter an email",
    "mem.removeConfirm": " — remove from the project?", "mem.me": "(you)",
    "home.myProjects": "My projects", "home.newProject": "New project", "home.received": "Received invites",
    "home.accept": "Accept", "home.decline": "Decline", "home.openDoc": "Open document", "home.memberCount": "members",
    "home.noProjects": "No projects yet. Start one with New project at the top right.",
    "create.title": "New project", "create.titlePh": "e.g. Pop-up store launch", "create.myRole": "My role in this project", "create.make": "Create project",
    "share.title": "Link-share viewer", "share.sub": "Anyone with the link can read", "share.copy": "Copy",
    "nav.invites": "Received invites", "nav.logout": "Log out",
    "role.planner": "Planning", "role.developer": "Dev", "role.designer": "Design", "role.ops": "Ops",
    "roleName.planner": "Planner", "roleName.developer": "Developer", "roleName.designer": "Designer", "roleName.ops": "Ops",
    "perm.owner": "Owner", "perm.editor": "Editor", "perm.viewer": "Restricted viewer", "perm.link": "Link viewer",
    "type.project": "Project",
  },
  ja: {
    "lens.paper": "白書", "lens.side": "並べて", "lens.conv": "会話", "lens.data": "データ",
    toc: "目次", agreementStatus: "合意状況", continueConversation: "会話を続ける", startDiscussion: "議論を開始",
    notWritten: "まだ未作成です。会話でこのテーマを議論し合意すると、ここに反映されます。",
    distill: "白書に反映（蒸留）", distilled: "✓ 白書に反映済み", distilling: "蒸留中…",
    distillNone: "会話が蓄積されると白書に蒸留できます", distillCached: "すでに最新です", distillDone: "白書に反映しました",
    export: "エクスポート", docInfo: "ドキュメント情報", status: "ステータス", agreement: "合意", createdAt: "作成日", members: "メンバー",
    agreed: "合意済み", discussing: "議論中", draft: "下書き", noAgreementItems: "まだ合意する項目がありません。",
    sectionConversation: "会話", perspectiveSuffix: "視点",
    "data.title": "データ · RAG",
    "data.sub": "白書のすべての節・項目が安定キーと状態を持つ検索可能なチャンクになります。標準構造なのでAIが機械的に問い合わせできます。",
    "data.query": "メタデータ照会", "data.clear": "クリア", "data.chunks": "インデックスチャンク", "data.schema": "RAG インデックススキーマ",
    "data.qAgreed": "合意済みの項目は？", "data.qDiscussing": "議論中の項目は？", "data.qEmpty": "未作成の節は？", "data.qCounts": "節ごとの項目数は？",
    "kind.meta": "メタ", "kind.section": "項目", "kind.empty": "節（空）",
    "rec.heading": "記録", "rec.headingSub": "白書の会話から自動生成されます — 別途作成しません。",
    "rec.minutes": "議事録", "rec.minutesSub": "会話を日付ごとに整理",
    "rec.releases": "リリース", "rec.releasesSub": "合意・蒸留時点の決定スナップショット",
    "rec.minutesEmpty": "まだ会話がありません。白書で議論を始めると、ここに議事録が蓄積されます。",
    "rec.releasesEmpty": "まだ合意された決定がありません。並べてレンズで「白書に反映（蒸留）」するとリリースが記録されます。",
    "rec.backProject": "← プロジェクト", "rec.count": "件",
    "pj.back": "← マイプロジェクト", "pj.myRole": "自分の職種", "pj.myPerm": "自分の権限",
    "pj.whitepaper": "白書", "pj.records": "記録", "pj.recordsAuto": "会話から自動生成",
    "pj.recMinutesDesc": "会話を日付ごとに整理した会議記録", "pj.recReleasesDesc": "合意・蒸留のたびに記録される決定ノート",
    "pj.view": "表示", "pj.exportMd": ".md エクスポート", "pj.empty": "まだありません。",
    "pj.ownerCanManage": "· 職種・権限の変更/削除が可能", "pj.pending": "保留中の招待", "pj.cancel": "取消",
    "mem.invite": "メンバー招待", "mem.email": "メール", "mem.role": "職種", "mem.perm": "権限", "mem.send": "招待を送る",
    "mem.added": "メンバーを追加しました", "mem.sent": "招待を送りました", "mem.needEmail": "メールを入力してください",
    "mem.removeConfirm": "さんをプロジェクトから削除しますか？", "mem.me": "（自分）",
    "home.myProjects": "マイプロジェクト", "home.newProject": "新規プロジェクト", "home.received": "受け取った招待",
    "home.accept": "承認", "home.decline": "辞退", "home.openDoc": "ドキュメントを開く", "home.memberCount": "メンバー",
    "home.noProjects": "まだプロジェクトがありません。右上の新規プロジェクトから始めましょう。",
    "create.title": "新規プロジェクト", "create.titlePh": "例：ポップアップストア立ち上げ", "create.myRole": "このプロジェクトでの自分の職種", "create.make": "プロジェクトを作成",
    "share.title": "リンク共有ビューア", "share.sub": "リンクがあれば誰でも閲覧可", "share.copy": "コピー",
    "nav.invites": "受け取った招待", "nav.logout": "ログアウト",
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
