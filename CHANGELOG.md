# Changelog

SyncDoc 버전 히스토리. 형식은 [Keep a Changelog](https://keepachangelog.com/) 약식, 버전은 [SemVer](https://semver.org/).

## [v0.4.0] — 2026-07-04

보안 강화 + 문서 활동 감사. "남의 문서는 못 건드리고, 보관/해제는 티가 난다."

### Security (배포 전 필수 수정)
- **크로스 테넌트 IDOR 차단** — 문서(`/doc/*`)의 모든 읽기·쓰기 경로에 멤버십 게이트(`repo.requireDocAccess`) 적용. 비멤버는 존재를 숨겨 404. 그전엔 로그인한 누구나 `docId`를 바꿔 남의 백서·채팅을 열람/수정/보관할 수 있었다.
- **첨부 파일 IDOR + 저장형 XSS 차단** — 파일 서빙에 멤버십 게이트 + 진짜 이미지(SVG 제외)만 `inline`, 그 외는 `attachment` + `X-Content-Type-Options: nosniff`. 업로드한 HTML/스크립트의 동일 출처 실행 방지.
- **`SESSION_SECRET` 운영 필수화** — 프로덕션에서 미설정 시 세션 처리 시점에 즉시 실패(fail fast). 공개된 개발용 기본키로 세션을 위조하던 경로 차단. (빌드는 깨지지 않도록 지연 평가)

### Added
- **문서 보관/해제 활동 로그** — `doc_activity`(append-only) 테이블에 "누가·언제·무엇을(보관/해제)"을 영구 기록. 삭제·수정 불가. 새 `DocActivityBanner`가 문서 상단(대화·백서 두 렌즈)에 "🔓 다시 열림 · 이름 · 시각"과 전체 이력을 노출(한/EN/日). 몰래 다시 여는 행위를 추적.
- **보관/해제 권한 분리** — 보관·해제 모두 **소유자·편집자만**(뷰어 차단). 서버 액션 거부 + 버튼 비노출(이중 방어). `repo.getDocPermission` 추가.

### Tests
- 자동 테스트 26 → **32**. 추가: 문서 접근 게이트(멤버/비멤버/레거시), 보관·해제 권한 판정, 활동 로그 append-only·최신순·중복 무기록.

## [v0.3.0] — 2026-06-16

품질·정리 + 로드맵 1차. (`main`, 브랜치 `feat/chat-driven-whitepaper` 머지본)

### Added
- **자동 테스트(Vitest)** — 결정적 로직 26개: 스키마/섹션/i18n/비밀번호, 세션 HMAC 서명·변조·만료, 번역 내용 캐시, 분류→증류 입력 선택, 입장 승인 흐름, 합의(전원 서명), 소유자 가드. `npm test`.
- **백서 화면 분류 교정** — 편집자가 백서 렌즈에서 각 절의 출처 메시지를 제외/재분류 → 자동 재증류 (`SectionCuration`).
- **이미지/PDF 내용 추출** — 비전 모델(새 의존성 없음)로 추출해 메시지에 실어 분류·증류에 반영. Anthropic=이미지+PDF / OpenAI=이미지 / 로컬=미지원(우아한 스킵).
- **/start 온보딩 다국어** — 마지막 한국어 고정 화면 i18n + 로그아웃 화면 언어 스위처.

### Changed / Removed
- 죽은 코드 정리: `CommentSidebar`·`comment-actions`, 구모델 **나란히·데이터 렌즈**(+Timeline/BlockView/DraftEditor/DistillButton/DataLens), 레거시 `translations`·`suggestions` 테이블, 고아 `addComment`, 미사용 스크립트·픽스처·i18n 키.
- 문서 렌즈를 **대화(채팅)·백서 2개**로 축소.
- `components/`를 기능별 폴더로 재구성(chat·whitepaper·doc·project·start·common).
- 순 변화 약 −2,000 LOC.

## [v0.2.0] — 2026-06-15

채팅 기반 백서 — "떠드는 건 사람, 정리는 AI."

### Added
- **프로젝트 채팅방** — 통합 타임라인 메신저 UI(대화 렌즈). Enter 전송, **파일·이미지·PDF 첨부**(📎), **객관식 추천 메시지**(✨).
- **문장 단위 번역** — 다른 사람 메시지를 "내 수준으로 보기" 토글로 (직군×언어×숙련도) 충실 번역. **내용 해시 캐시**로 토큰 절약.
- **AI 자동 분류·증류** — 메시지를 5절로 분류 → 내용 바뀐 절을 자동 증류해 백서 갱신(수동 버튼 없음).
- **입장 승인** — 비멤버 입장 요청 → 소유자 승인.
- 합의(참여자 전원 서명) → Abstract/TOC 표지. 자동 파생 회의록·릴리스(+`.md`).

### Changed
- 입력 표면을 "절 골라 쓰기"에서 **프로젝트 채팅방**으로 전환. 합의·교정은 백서 렌즈로 이동.

## [v0.1.0] — 2026-06-14

MVP. 멀티 직군 프로젝트, 블록 에디터 백서, 4-렌즈, N직군×N언어 번역, 증류, 합의. (보존: 브랜치 `archive/v0.1.0`)

[v0.4.0]: https://github.com/teo-baek/syncdoc/releases/tag/v0.4.0
[v0.3.0]: https://github.com/teo-baek/syncdoc/releases/tag/v0.3.0
[v0.2.0]: https://github.com/teo-baek/syncdoc/releases/tag/v0.2.0
[v0.1.0]: https://github.com/teo-baek/syncdoc/releases/tag/v0.1.0
