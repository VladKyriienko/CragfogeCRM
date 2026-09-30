# syntax=docker/dockerfile:1

FROM oven/bun:1.3-debian AS deps
WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/

RUN bun install --frozen-lockfile

FROM deps AS build
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/api ./apps/api

RUN bun --filter @cragfoge/shared build \
  && bun --filter @cragfoge/db build \
  && bun --filter @cragfoge/api build

FROM oven/bun:1.3-debian AS runtime
WORKDIR /app

RUN groupadd --system --gid 1001 crm \
  && useradd --system --uid 1001 --gid crm --home /app --shell /usr/sbin/nologin crm \
  && apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/bun.lock /app/turbo.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

RUN chmod +x ./apps/api/docker-entrypoint.sh \
  && chown -R crm:crm /app

USER crm
ENV NODE_ENV=production \
    PROCESS_ROLE=all \
    RUN_MIGRATIONS_ON_START=false \
    API_HOST=0.0.0.0 \
    API_PORT=3000

EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${API_PORT}/health" || exit 1

ENTRYPOINT ["./apps/api/docker-entrypoint.sh"]
