# SyncDoc

**하나의 문서, 모든 직군 — 각자의 언어로.**
_One document, every role — each in their own language._

서로 다른 직군(기획·개발·디자인·운영)과 서로 다른 언어(한국어·English·日本語)의 사람들이 **하나의 백서(whitepaper)** 를 함께 만드는 협업 툴입니다. 자유로운 대화가 AI를 통해 **각자의 직군 관점 + 모국어**로 번역되어 보이고, 그 대화가 합의를 거쳐 **정규 구조의 백서**로 증류됩니다. 회의록과 릴리스 노트는 그 대화에서 **자동으로 파생**됩니다.

> 핵심 아이디어: **대화 = 입력, 백서 = 출력.** 사용자는 부담 없이 대화로 던지고, AI가 그것을 표준 문서로 정리합니다. 같은 블록이 보는 사람마다 다르게 렌더링되고(직군×언어), 합의 시점의 결정이 박제됩니다.

---

## 목차
- [빠른 시작](#빠른-시작)
- [AI 프로바이더 설정](#ai-프로바이더-설정)
- [데모 계정 & 5분 둘러보기](#데모-계정--5분-둘러보기)
- [주요 기능](#주요-기능)
- [화면 · 라우트](#화면--라우트)
- [아키텍처 & 데이터 모델](#아키텍처--데이터-모델)
- [핵심 불변식](#핵심-불변식)
- [명령어](#명령어)
- [프로젝트 구조](#프로젝트-구조)
- [기술 스택](#기술-스택)
- [로드맵](#로드맵)

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

> **AI 키 없이도 실행됩니다.** 키를 넣지 않으면 번역·증류·요약(Abstract) 기능만 "실패"로 표시되고 재시도 버튼이 뜹니다 — 회원가입·프로젝트·문서·대화·합의 등 나머지는 모두 동작하고 문서 히스토리는 안전합니다.

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

## 데모 계정 & 5분 둘러보기

첫 실행 시 다음 데모 계정·프로젝트가 시드됩니다 (비밀번호 모두 `demo1234`):

| 이메일 | 이름 | 기본 직군 |
|---|---|---|
| `mina@team.co` | 박미나 | 기획 (팝업스토어 프로젝트 소유자) |
| `jun@team.co` | Jun | 개발 |
| `sora@team.co` | Sora | 디자인 |

> 기존 username 로그인도 가능: `planner` / `developer` (비번 `demo1234`).

**둘러보기**
1. `mina@team.co` / `demo1234` 로 로그인 → **내 프로젝트**.
2. "팝업스토어 오픈 프로젝트" → **문서 열기** → 워크스페이스에서 팀원·초대 관리, 그리고 **백서** 열기.
3. 문서 상단 **언어·수준 컨트롤**에서 `English`/`日本語`로 바꾸면 백서·대화가 그 언어로 번역됩니다.
4. **나란히** 렌즈에서 한 절의 대화를 보내고 → **"백서에 반영(증류)"** → 백서가 한 단락 자라납니다.
5. 참여자(소유자·편집자) 전원이 **동의(서명)** 하면 합의되어 상단 **Abstract 표지**가 생성됩니다.
6. **데이터** 렌즈에서 문서가 어떻게 검색 가능한 구조 데이터(RAG)가 되는지, **기록** 카드에서 자동 생성된 회의록·릴리스를 확인하세요.

---

## 주요 기능

- **온보딩 & 프로젝트** — 이메일 회원가입/로그인(다중 계정, 같은 직군 여러 명 협업), 프로젝트 생성, 팀원 초대(직군+권한), 받은 초대 수락/거절, 링크 공유.
- **멤버·초대 관리** — 소유자가 직군·권한 변경/제거(마지막 소유자 보호), 초대 보내기·대기 초대 취소.
- **문서 4-렌즈** — **백서**(목차 있는 산문 문서) · **나란히**(절 본문 + 그 절 대화) · **대화**(타임라인+작성기+댓글) · **데이터**(RAG 청크·메타데이터 질의·스키마).
- **정규 백서 스키마** — 모든 문서가 고정 5절 골격(0 문서정보 · 1 목적과 지향점 · 2 결과물과 세부 과업 · 3 수행 방식과 제약 · 4 운영 규칙 및 리스크). 절 안 항목은 증류로 자동 생성.
- **직군 × 자연어 번역** — 같은 블록이 보는 사람의 (직군 관점 × 한/EN/日)으로 렌더링. 언어 전환·문서 진입 시 누락 번역 자동 생성·캐시.
- **증류(대화 → 백서)** — 합의된 대화를 AI가 산문으로 1회 증류·캐시(같은 대화면 재호출 없음).
- **합의(서명)** — 참여자 전원 서명 시 합의 → Abstract/TOC 표지 자동 생성. 누가 동의했는지 박제.
- **자동 파생 기록** — 회의록(대화 날짜별)·릴리스(합의 시 append-only 스냅샷)를 뷰 + `.md`로.
- **숙련도 레벨** — 입문/중급/전문가에 맞춰 번역 표현이 조정.
- **다국어 UI · 반응형** — 문서·관리 화면 한/EN/日, 모바일에서 단일 컬럼으로 스택.

---

## 화면 · 라우트

| 라우트 | 설명 |
|---|---|
| `/start` | 온보딩 셸 — 로그인/가입, 내 프로젝트, 생성 |
| `/project/[id]` | 워크스페이스 — 백서·멤버·초대·기록 |
| `/project/[id]/record` | 회의록·릴리스 뷰 |
| `/project/[id]/record/export` | 회의록·릴리스 `.md` 내보내기 |
| `/doc/[id]` | 백서 문서 (`?lens=paper\|side\|conv\|data`, `&sec=`) |
| `/doc/[id]/export` | 문서 전체 `.md` 내보내기 |
| `/login` | 시드 계정 로그인 (`/`는 `/start`로 리다이렉트) |

---

## 아키텍처 & 데이터 모델

- **`lib/repo.ts`** — 유일한 데이터 접근 경로. 모든 불변식이 여기서 강제됩니다.
- **`lib/db.ts`** — better-sqlite3 연결 + 멱등 DDL/마이그레이션 + 데모 시드.
- **`lib/ai.ts`** — `translate` / `translateProse` / `suggest` / `abstract` / `distillSection`. 프로바이더 추상화, 항상 `{ ok, ... }` 반환(throw 안 함).
- **`lib/translation-runner.ts`** — 번역 생성 러너(서버 액션·문서 페이지 공유).
- **`lib/sections.ts` · `lib/i18n.ts`** — 정규 5절 상수 / UI 다국어 사전.

**핵심 테이블**
`users`(email·name·lang·level) · `projects` · `project_members`(role 4 × perm 4) · `invites` · `documents`(project_id·kind) · `blocks`(author_project_role·section_key) · **`block_translations`**(블록 × 직군 × 언어) · `section_content`(증류 산문 + 캐시 sig) · **`section_content_i18n`**(절 × 언어) · `signatures` · `release_entries`(append-only) · `abstracts` · `comments` · `suggestions`.

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
node scripts/verify-immutability.cjs   # 잠금 블록 불변식 음성 테스트 (롤백 안전)
```

---

## 프로젝트 구조

```
syncdoc/
├─ app/
│  ├─ start/                 # 온보딩·홈 (page + actions)
│  ├─ project/[id]/          # 워크스페이스 (page + actions)
│  │  └─ record/             # 회의록·릴리스 뷰 + export
│  ├─ doc/[id]/              # 백서 문서 (page + actions + approval-actions + export)
│  ├─ login/                 # 로그인
│  └─ page.tsx               # / → /start 리다이렉트
├─ components/               # WhitepaperReader, DocLensShell, DataLens, DistillButton,
│                            # MemberAdmin, InviteForm, PendingInvites, Timeline, BlockView … (16개)
├─ lib/                      # repo, db, ai, translation-runner, sections, i18n, session, password, schema
├─ scripts/verify-immutability.cjs
└─ .env.local.example
```

---

## 기술 스택
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · better-sqlite3 (+ Drizzle 스키마) · `@anthropic-ai/sdk` / OpenAI·Ollama 호환 (fetch).

---

## 로드맵 (후순위)
- 온보딩 셸(`/start`) UI 라벨 다국어 — 현재 한국어 고정(문서·프로젝트·관리 화면은 한/EN/日 완료).
- 자동 테스트(번역/증류 골든 케이스, 권한 가드 회귀).
- 모바일 전용 UX 디테일(바텀시트 등) — 현재는 반응형 스택까지.

---

## 라이선스
미정 (사용 전 저장소 소유자에게 확인).
