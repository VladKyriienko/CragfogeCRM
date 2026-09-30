# Upgrade guide

## Standard upgrade

1. **Backup** Postgres and object storage ([BACKUP.md](./BACKUP.md)).
2. Pull / rebuild images:

   ```bash
   cd deploy
   docker compose -f docker-compose.selfhost.yml --profile minio --profile mail pull
   docker compose -f docker-compose.selfhost.yml --profile minio --profile mail build
   ```

3. Recreate app containers (migrations run automatically on API start under an advisory lock):

   ```bash
   docker compose -f docker-compose.selfhost.yml --profile minio --profile mail up -d
   ```

4. Watch API logs until health is green:

   ```bash
   docker compose -f docker-compose.selfhost.yml logs -f api
   curl -fsS "http://localhost/api/health"
   ```

Only one API replica should set `RUN_MIGRATIONS_ON_START=true` (the compose file already does this). Extra API containers that also migrate will wait on `pg_advisory_lock` and then no-op if already applied.

## Rollback

1. Stop api / worker / web.
2. Restore the Postgres dump taken before the upgrade.
3. Restore the object-storage mirror from the same point in time.
4. Check out / rebuild the previous image tag and `up -d`.

Drizzle migrations are forward-only in this project — do not edit applied SQL files. Roll back by restoring data + previous images.

## Breaking env changes

After upgrading, diff `deploy/.env.selfhost.example` against your `.env.selfhost` and add any new required variables (especially `LICENSE_PUBLIC_KEY`, `SENTRY_DSN`, `AUTH_REQUIRE_EMAIL_VERIFICATION`).
