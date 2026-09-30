#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS_ON_START:-false}" = "true" ]; then
  echo "Running database migrations (advisory lock)…"
  bun --filter @cragfoge/db migrate:lock
fi

exec node apps/api/dist/main.js
