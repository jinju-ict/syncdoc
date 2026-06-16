# SyncDoc

**하나의 문서, 모든 직군 — 각자의 언어로.**
_One document, every role — each in their own language._

서로 다른 직군(기획·개발·디자인·운영)과 서로 다른 언어(한국어·English·日本語)의 사람들이 **프로젝트 채팅방**에서 평소처럼 대화하고 파일·이미지·PDF를 주고받으면, **AI가 비서처럼 그 대화를 정리해 하나의 백서(whitepaper)로 자동 완성**하는 협업 툴입니다. 다른 직군의 메시지는 "내 수준으로 보기" 토글로 내 관점·모국어에 맞춰 번역되고, 회의록과 릴리스 노트는 그 대화에서 **자동으로 파생**됩니다.

> 핵심 아이디어: **떠드는 건 사람, 정리는 AI.** 대화 = 입력, 백서 = 출력. 사용자는 부담 없이 채팅하고, 뒤에서 AI가 메시지를 절(節)로 분류해 표준 구조의 백서로 증류합니다. 같은 메시지가 보는 사람마다 다르게 번역되고(직군×언어×숙련도), 합의 시점의 결정이 릴리스로 박제됩니다.

---

## 목차
- [빠른 시작](#빠른-시작)
- [AI 프로바이더 설정](#ai-프로바이더-설정)
- [시작하기 (5분 둘러보기)](#시작하기-5분-둘러보기)
- [주요 기능](#주요-기능)
- [화면 · 라우트](#화면--라우트)
- [아키텍처 & 데이터 모델](#아키텍처--데이터-모델)
- [핵심 불변식](#핵심-불변식)
- [명령어](#명령어)
- [프로젝트 구조](#프로젝트-구조)
- [기술 스택](#기술-스택)
- [로드맵](#로드맵)
- [배포 (Cloud Run)](#배포-cloud-run)

---

## 빠른 시작

### 요구 사항
- **Node.js ≥ 20** (개발은 22.x에서 검증)
- npm (또는 pnpm/yarn)
- `better-sqlite3`가 네이티브 모듈을 빌드합니다 — macOS/Linux는 보통 자동, **Windows는 빌드 툴이 없으면** [windows-build-tools](https://github.com/nodejs/node-gyp#on-windows) 또는 Visual Studio Build Tools가 필요할 수 있습니다.

### 설치 & 실행
```bash
# 1) 클론
git clone <your-repo-url> syncdoc
cd syncdoc

# 2) 의존성 설치
npm install

# 3) 환경변수 준비 (AI 키는 선택 — 없어도 앱은 돌아갑니다)
cp .env.local.example .env.local
#   .env.local 을 열어 AI 키를 넣으면 번역/증류가 동작합니다 (아래 'AI 프로바이더 설정' 참고)

# 4) 개발 서버
npm run dev
#   → http://localhost:3000  (DB는 첫 실행 시 자동 생성·시드됩니다)
```

> **AI 키 없이도 실행됩니다.** 키를 넣지 않으면 번역·분류·증류·요약(Abstract) 등 AI 기능만 조용히 건너뛰고 — 회원가입·프로젝트·채팅·파일 첨부·합의 등 나머지는 모두 동작하고 대화 히스토리는 안전합니다. (백서는 AI가 있어야 채워집니다)

### 프로덕션 빌드
```bash
npm run build   # 프로덕션 빌드 + TypeScript 체크 (검증 게이트)
npm run start   # 빌드 결과 서빙
```

데이터베이스는 별도 마이그레이션 명령이 필요 없습니다. 첫 연결 시 `lib/db.ts`가 스키마를 생성하고 데모 데이터를 시드합니다(멱등). 파일 위치는 기본 `<프로젝트 루트>/syncdoc.db`이며 `SYNCDOC_DB_PATH`로 바꿀 수 있습니다.

---

## AI 프로바이더 설정

`.env.local`에서 **세 프로바이더 중 하나만** 설정하면 됩니다. `AI_PROVIDER`를 비워두면 키가 있는 순서(Anthropic → OpenAI → Ollama)로 자동 감지합니다.

| 변수 | 설명 | 기본값 |
|---|---|---|
| `AI_PROVIDER` | `anthropic` \| `openai` \| `ollama` (비우면 자동 감지) | — |
| `ANTHROPIC_API_KEY` | Anthropic(Claude) 키 | — |
| `ANTHROPIC_MODEL` | Claude 모델 | `claude-opus-4-8` |
| `OPENAI_API_KEY` | OpenAI 키 | — |
| `OPENAI_MODEL` | OpenAI 모델 (openai 사용 시 필수, 예 `gpt-5-mini`) | — |
| `OPENAI_BASE_URL` | OpenAI 호환 프록시 주소 | `https://api.openai.com/v1` |
| `OLLAMA_MODEL` | 로컬 모델 (ollama 사용 시 필수, 예 `qwen3:8b`) | — |
| `OLLAMA_BASE_URL` | 로컬 서버 주소 (LM Studio는 `:1234/v1`) | `http://localhost:11434/v1` |
| `SESSION_SECRET` | 세션 서명용 HMAC 시크릿 — **운영에서는 반드시 설정** | 개발용 기본값 |
| `SYNCDOC_DB_PATH` | SQLite 파일 경로 | `./syncdoc.db` |

**예시 — Claude로 켜기**
```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```
**예시 — 완전 로컬(무료, Ollama)**
```bash
# 터미널: ollama pull qwen3:8b
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen3:8b
```

---

## 시작하기 (5분 둘러보기)

DB는 **완전 백지 상태**로 시작합니다 — 데모 계정·프로젝트가 없으니 **회원가입부터** 합니다. (모든 인증 동선은 `/start`로 모입니다.)

1. 루트(`/`)로 접속 → **회원가입**(이름·이메일·비밀번호). 같은 직군 여러 명이 각자 가입해 협업할 수 있습니다.
2. **내 프로젝트**(세로 리스트)에서 **새 프로젝트** 생성 → 프로젝트 = 채팅방이 함께 만들어집니다. 행을 누르면 바로 **채팅방(대화 렌즈)** 으로 진입.
3. 채팅에 메시지를 보내거나 📎로 **파일·이미지·PDF**를 올려보세요. **✨** 버튼으로 추천 메시지도.
4. (팀 테스트) **관리** 버튼에서 팀원을 초대(이메일+직군+권한)하거나 링크 공유. 다른 직군으로 가입한 사람이 같은 메시지를 **"내 수준으로 보기"** 토글하면 자기 관점·언어로 번역됩니다.
5. 잠시 후 상단 탭에서 **백서** 렌즈로 가보면, 대화가 절별로 자동 정리돼 채워집니다 — 누르는 버튼 없이 AI가 알아서. (틀린 분류는 백서 화면에서 편집자가 제외/재분류 → 자동 재정리)
6. 참여자(소유자·편집자) 전원이 백서 렌즈에서 **동의(서명)** 하면 합의되어 상단 **Abstract 표지**가 생성됩니다.

> AI 키가 없으면 번역·분류·증류 같은 AI 정리는 건너뜁니다(가입·채팅·파일은 정상). 키 설정은 위 "AI 프로바이더 설정" 참고.

---

## 주요 기능

- **온보딩 & 프로젝트** — 이메일 회원가입/로그인(다중 계정, 같은 직군 여러 명 협업), 프로젝트 생성(=채팅방 1개), 팀원 초대(직군+권한), 받은 초대 수락/거절, 링크 공유, **입장 승인**(비멤버 입장 요청 → 소유자 승인).
- **프로젝트 채팅방 (대화 렌즈)** — 통합 타임라인의 메신저형 UI. 메시지(Enter 전송) + **파일·이미지·PDF 첨부**(📎, 이미지 미리보기·다운로드) + **객관식 추천 메시지**(✨).
- **문장 단위 번역** — 다른 사람 메시지를 "내 수준으로 보기" 토글 시 내 (직군×언어×숙련도)에 맞춰 충실 번역(백서식으로 부풀리지 않음). **내용 해시 캐시**로 같은 문장 반복 시 AI 생략.
- **AI 자동 분류·증류 (백서 렌즈)** — 메시지를 5절(0 문서정보·1 목적과 지향점·2 결과물과 세부 과업·3 수행 방식과 제약·4 운영 규칙 및 리스크) 중 하나로 자동 분류 → 내용이 바뀐 절을 **자동 증류해 백서를 갱신**(수동 버튼 없음, 시그니처 캐시로 중복 방지).
- **백서 화면 교정** — 편집자가 백서 렌즈에서 각 절의 **출처 메시지**를 보고 잘못 분류된 것을 **제외/재분류** → 해당 절 자동 재증류. (채팅은 단순하게 유지)
- **이미지/PDF 내용 추출** — 첨부를 비전 모델로 읽어 메시지에 실어 분류·증류에 반영(Anthropic=이미지+PDF / OpenAI=이미지 / 로컬=미지원, 우아하게 스킵).
- **합의(서명)** — 참여자 전원 서명 시 합의 → Abstract/TOC 표지 자동 생성. 누가 동의했는지 박제. 새 메시지를 보내면 합의·서명 초기화.
- **자동 파생 기록** — 회의록(대화 날짜별)·릴리스(증류 시 append-only 스냅샷)를 뷰 + `.md`로.
- **다국어 UI · 반응형** — 문서·관리 화면 한/EN/日, 모바일에서 단일 컬럼으로 스택.

---

## 화면 · 라우트

| 라우트 | 설명 |
|---|---|
| `/` | 인증 진입점 → `/start`로 모임 (비로그인·`/login` 모두 리다이렉트) |
| `/start` | 온보딩 셸 — **회원가입·이메일 로그인**, 내 프로젝트, 생성 |
| `/project/[id]` | 워크스페이스 — 백서·멤버·초대·기록 |
| `/project/[id]/record` | 회의록·릴리스 뷰 |
| `/project/[id]/record/export` | 회의록·릴리스 `.md` 내보내기 |
| `/doc/[id]` | 문서 — 기본 **백서**, `?lens=conv` 는 **채팅(대화)** |
| `/doc/[id]/file/[aid]` | 채팅 첨부 파일 서빙 (세션·소속 doc 가드) |
| `/doc/[id]/export` | 문서 전체 `.md` 내보내기 |

---

## 아키텍처 & 데이터 모델

- **`lib/repo.ts`** — 유일한 데이터 접근 경로. 모든 불변식이 여기서 강제됩니다.
- **`lib/db.ts`** — better-sqlite3 연결 + 멱등 DDL/마이그레이션. 시드는 **비어 있음**(백지 시작 — 가입부터).
- **`lib/ai.ts`** — `translate`(문장 통역) / `translateProse` / `classifyMessage` / `suggestReplies` / `abstract` / `distillSection`. 프로바이더 추상화, 항상 `{ ok, ... }` 반환(throw 안 함).
- **`lib/translation-runner.ts`** — 번역·분류·증류 러너(서버 액션·문서 페이지 공유). 렌더 후 `after()`에서 비차단 실행.
- **`lib/uploads.ts`** — 첨부 파일 디스크 저장(`uploads/`, 10MB 제한).
- **`lib/sections.ts` · `lib/i18n.ts`** — 정규 5절 상수 / UI 다국어 사전.

**핵심 테이블**
`users`(email·name·lang·level) · `projects` · `project_members`(role 4 × perm 4) · `invites` · **`join_requests`**(입장 승인) · `documents`(project_id·kind) · `blocks`(=메시지, author_project_role) · **`block_translations`**(블록 × 직군 × 언어) · **`translation_cache`**(내용해시 × 직군 × 언어 × 수준) · **`message_relevance`**(메시지 → 절 분류·관련도) · **`attachments`**(파일/링크) · `section_content`(증류 산문 + 캐시 sig) · `section_content_i18n`(절 × 언어) · `signatures` · `release_entries`(append-only) · `abstracts`.

**직군 모델** — 직군은 사용자 전역 속성이 아니라 **프로젝트 멤버십**(`project_members.role`). 같은 직군 여러 명이 각자 계정으로 협업합니다. 번역·렌더링은 4직군(기획/개발/디자인/운영) 전부, 정본 원문은 한국어.

---

## 핵심 불변식 (깨지 말 것)

1. **확정(locked) 블록 불변** — UPDATE/DELETE 영구 불가. `lib/repo.ts`에 쓰기 경로가 없고, SQLite `BEFORE UPDATE/DELETE` 트리거가 2중 방어. (`node scripts/verify-immutability.cjs`로 검증)
2. **보내기 = 단일 트랜잭션** — 블록 잠금 → 승인 해제 → 서명 비움. 번역은 트랜잭션 밖에서 (직군×언어)별 생성.
3. **번역/증류 캐시** — 같은 시그니처면 AI를 재호출하지 않음. 번역 기록은 조건부 UPDATE로 경합 무해화.
4. **합의** — 참여자(소유자·편집자) 전원 서명 시 합의 → Abstract 생성(append-only). 새 블록을 보내면 합의·서명이 초기화.
5. **draft 가시성** — 초안은 작성자 본인에게만, 절(section)별로 구분.

---

## 명령어

```bash
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드 + TypeScript 체크
npm run start    # 프로덕션 서버
npm run lint     # ESLint
npm test         # Vitest (결정적 로직 26개 — 캐시·분류·합의·입장승인·세션 등)
node scripts/verify-immutability.cjs   # 잠금 블록 불변식 음성 테스트 (롤백 안전)
node scripts/verify-archive.cjs        # 보관 문서 읽기전용 트리거 테스트 (롤백 안전)
```

---

## 프로젝트 구조

```
syncdoc/
├─ app/
│  ├─ start/                 # 온보딩·홈 (page + actions)
│  ├─ project/[id]/          # 워크스페이스 (page + actions)
│  │  └─ record/             # 회의록·릴리스 뷰 + export
│  ├─ doc/[id]/              # 문서 (page + actions + approval-actions + export)
│  │  └─ file/[aid]/         # 첨부 파일 서빙 라우트
│  ├─ login/                 # 폐기 — /start로 리다이렉트
│  └─ page.tsx               # / → /start
├─ components/               # 기능별 폴더
│  ├─ chat/                  # ChatRoom, ChatMessage, ChatComposer
│  ├─ whitepaper/            # WhitepaperReader, AbstractHeader, SectionCuration
│  ├─ doc/                   # DocLensShell, ArchiveButton, LevelSelector
│  ├─ project/               # MemberAdmin, InviteForm, PendingInvites, JoinRequest(s/Form)
│  ├─ start/                 # StartShell
│  └─ common/                # Markdown
├─ lib/                      # repo, db, ai, translation-runner, uploads, sections, i18n, session, password, schema
├─ tests/                    # Vitest (unit/ + repo/) + global-setup
├─ scripts/                  # verify-immutability.cjs, verify-archive.cjs
├─ Dockerfile · DEPLOY.md    # Cloud Run 배포 (가이드: DEPLOY.md)
├─ uploads/                  # (gitignore) 첨부 파일 저장소
└─ .env.local.example
```

---

## 기술 스택
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · better-sqlite3 (+ Drizzle 스키마) · `@anthropic-ai/sdk` / OpenAI·Ollama 호환 (fetch).

---

## 로드맵 (후순위)
- **영속 저장 (Cloud SQL)** — 현재 SQLite(파일) + 로컬 업로드라 Cloud Run에선 데이터가 휘발적. Postgres(Cloud SQL) + GCS로 전환하면 영구 보존. (`lib/repo.ts` 단일 경로라 교체 지점이 명확)
- **실시간 협업** — 지금은 새로고침 기반. 라이브 반영(SSE/WebSocket).
- **자유 직군(N-role)** — 현재 4직군 고정 → 사용자 정의 직군 + 번역 프롬프트 일반화.
- 백서 직접 편집·항목 단위 질문, 알림/활동 피드, 임베딩 기반 시멘틱 캐시.

> 완료됨(v0.3): 백서 화면 분류 교정 · 이미지/PDF 추출 · /start 다국어 · 자동 테스트.

---

## 배포 (Cloud Run)

컨테이너(`Dockerfile`)가 포함돼 있어 **Google Cloud Run**에 바로 올릴 수 있습니다. 초보자용 단계별 가이드는 **[`DEPLOY.md`](./DEPLOY.md)** 참고.

```bash
# Cloud Shell에서 (요약)
gcloud run deploy syncdoc --source . --region asia-northeast3 \
  --allow-unauthenticated --memory 1Gi --min-instances 1 --max-instances 1
```

- AI 키·세션 시크릿은 배포 후 환경변수로 주입(`gcloud run services update ... --update-env-vars`).
- ⚠️ 현재 SQLite는 컨테이너 `/tmp`에 있어 **인스턴스 재생성 시 데이터 초기화**(검증·데모용). 영구 보존은 로드맵의 Cloud SQL 전환으로.

---

## 라이선스
미정 (사용 전 저장소 소유자에게 확인).
