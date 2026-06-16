# SyncDoc 컨테이너 — Cloud Run / 모든 컨테이너 호스팅 공용.
# 2단계 빌드: build(전체 도구)에서 빌드·prune → runtime(slim)으로 산출물만 복사.

# ---- build ----
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run 등 컨테이너에서 쓰기 가능한 위치 (인스턴스 한정·휘발성).
# 영속 저장이 필요하면 Cloud SQL/GCS로 바꾸고 이 두 변수를 덮어쓴다.
ENV SYNCDOC_DB_PATH=/tmp/syncdoc.db
ENV SYNCDOC_UPLOAD_DIR=/tmp/uploads
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
# Cloud Run은 $PORT(기본 8080)로 트래픽을 보낸다 — next start가 PORT 환경변수를 따른다.
EXPOSE 8080
CMD ["npm", "run", "start"]
