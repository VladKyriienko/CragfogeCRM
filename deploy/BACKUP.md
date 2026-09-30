# Backup and restore

Self-host backups have two parts: **Postgres** (source of truth for CRM data) and **object storage** (files and export CSVs).

## Postgres

### Backup

```bash
docker compose -f deploy/docker-compose.selfhost.yml exec -T postgres \
  pg_dump -U postgres -d crm -Fc > "crm-$(date +%Y%m%d).dump"
```

### Restore

Stop the API/worker first so nothing writes during restore:

```bash
docker compose -f deploy/docker-compose.selfhost.yml stop api worker web
docker compose -f deploy/docker-compose.selfhost.yml exec -T postgres \
  pg_restore -U postgres -d crm --clean --if-exists < crm-YYYYMMDD.dump
docker compose -f deploy/docker-compose.selfhost.yml start api worker web
```

Use a consistent dump format (`-Fc`) so restores can be selective if needed.

## Object storage (MinIO / S3)

Files live under keys scoped by workspace. Mirror the bucket periodically.

### MinIO (`mc`)

```bash
mc alias set local http://localhost:9000 "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"
mc mirror local/crm "./backups/crm-files-$(date +%Y%m%d)"
```

### AWS CLI (any S3-compatible endpoint)

```bash
aws --endpoint-url "$S3_ENDPOINT" s3 sync "s3://$S3_BUCKET" "./backups/crm-files-$(date +%Y%m%d)"
```

Restore by syncing the backup directory back into the bucket.

## What not to back up

- Redis — job queues are ephemeral; lost jobs can be re-enqueued.
- Container images — rebuild from the repo / registry.
- `AUTH_SECRET` and DB passwords — store in a secrets manager, not in the dump.

## Cadence

- Daily Postgres dump + daily object-storage mirror is enough for most 1–20 user installs.
- Keep at least 7 daily and 4 weekly copies off-box.
