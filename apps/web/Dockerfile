# syntax=docker/dockerfile:1

FROM oven/bun:1.3-debian AS deps
WORKDIR /app

COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN bun install --frozen-lockfile

FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

RUN bun --filter @cragfoge/shared build \
  && bun --filter @cragfoge/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
