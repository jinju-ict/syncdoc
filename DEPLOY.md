# 배포 가이드 — Google Cloud Run (초보자용)

이 문서대로 따라 하면 SyncDoc을 **공개 HTTPS 주소**로 띄울 수 있습니다.
GCP를 처음 써도 됩니다 — 브라우저의 **Cloud Shell**만 쓰면 설치할 게 없습니다.

> ⚠️ 먼저 알아둘 점 (1차 배포 = 검증·데모용)
> - 지금은 데이터베이스가 **SQLite(파일)** 라, Cloud Run에서는 인스턴스가 새로 뜰 때마다
>   **데이터가 시드 상태로 초기화**됩니다. "배포가 되는지" 확인 + 데모엔 완벽하지만,
>   만든 대화·프로젝트가 영구 보존되진 않습니다.
> - 영구 보존이 필요해지면 맨 아래 **"영속성 업그레이드(Cloud SQL)"** 로 가세요.
> - 비용: Cloud Run은 트래픽 없으면 0으로 줄어듭니다(scale-to-zero). 무료 크레딧으로 충분.

---

## 0. 준비 (한 번만)

1. 브라우저에서 https://console.cloud.google.com 접속 → 로그인.
2. 우측 상단 **`>_` (Cloud Shell 활성화)** 아이콘 클릭 → 하단에 터미널이 열립니다.
   (gcloud가 이미 설치·로그인돼 있습니다.)
3. 프로젝트 ID 확인:
   ```bash
   gcloud projects list
   ```
   목록에서 쓸 프로젝트의 `PROJECT_ID`를 정하고 설정합니다:
   ```bash
   gcloud config set project <PROJECT_ID>
   ```

## 1. 코드 가져오기 (Cloud Shell 안에서)

```bash
git clone https://github.com/teo-baek/syncdoc.git
cd syncdoc
```

## 2. 필요한 API 켜기 (한 번만)

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 3. 배포 🚀

아래 한 줄이면 빌드(컨테이너) → 배포까지 자동입니다. (서울 리전 `asia-northeast3`)

```bash
gcloud run deploy syncdoc \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --memory 1Gi
```

- 처음엔 "Artifact Registry 저장소를 만들까요?" 류의 질문에 **Y/Enter**.
- 몇 분 뒤 **`Service URL: https://syncdoc-xxxx.a.run.app`** 가 출력됩니다 → 그 주소가 사이트입니다.

## 4. AI 키·세션 시크릿 넣기

AI 기능(번역/분류/증류)을 쓰려면 키를 환경변수로 넣습니다.
세션 서명용 시크릿도 운영에선 반드시 설정하세요(랜덤 문자열).

```bash
# 랜덤 세션 시크릿 만들기
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

gcloud run services update syncdoc --region asia-northeast3 \
  --set-env-vars "AI_PROVIDER=openai,OPENAI_MODEL=gpt-5-mini,OPENAI_API_KEY=sk-...여기에키...,SESSION_SECRET=$SECRET"
```

- Anthropic을 쓰면: `AI_PROVIDER=anthropic,ANTHROPIC_API_KEY=sk-ant-...` (모델은 생략 시 기본값).
- 업데이트 후 자동으로 새 버전이 배포됩니다.
- (더 안전하게 하려면 키는 Secret Manager로 — 처음엔 위 방식으로 충분합니다.)

## 5. 확인

- 출력된 **Service URL** 접속 → 데모 로그인: `mina@team.co` / `demo1234`.
- 채팅·백서·파일 첨부가 동작하면 성공입니다.

---

## 자주 쓰는 명령

```bash
# 코드 고친 뒤 재배포 (3번 명령 다시)
gcloud run deploy syncdoc --source . --region asia-northeast3 --allow-unauthenticated --memory 1Gi

# 로그 보기
gcloud run services logs read syncdoc --region asia-northeast3

# 서비스 주소 다시 확인
gcloud run services describe syncdoc --region asia-northeast3 --format="value(status.url)"

# 내리기(삭제)
gcloud run services delete syncdoc --region asia-northeast3
```

---

## 영속성 업그레이드 (나중에 — Cloud SQL)

데이터를 영구 보존하려면 SQLite → **Postgres(Cloud SQL)** 로 옮겨야 합니다.
이건 `lib/repo.ts`의 데이터 접근을 Postgres 드라이버로 바꾸는 **별도 마이그레이션 작업**입니다.
1차 배포로 "띄울 수 있다"를 확인한 뒤, 필요해지면 그때 진행하세요.
(첨부 파일도 마찬가지로 로컬 디스크 → Cloud Storage(GCS)로 옮깁니다.)
