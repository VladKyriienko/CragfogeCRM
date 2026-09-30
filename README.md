# Cragfoge CRM

Configurable CRM for small businesses. One codebase runs as cloud SaaS and self-hosted.

## Self-host in ~10 minutes

Prerequisites: Docker with Compose v2.

```bash
cp deploy/.env.selfhost.example deploy/.env.selfhost
# Edit AUTH_SECRET, POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY (and LICENSE_PUBLIC_KEY for real installs).

cd deploy
docker compose -f docker-compose.selfhost.yml --profile minio --profile mail up -d --build
```

Open http://localhost — when there are no users yet, `/setup` creates the first Owner and workspace.
Migrations run automatically on API start (Postgres advisory lock). See [deploy/BACKUP.md](deploy/BACKUP.md) and [deploy/UPGRADE.md](deploy/UPGRADE.md).

Compose services: `nginx` (web), `api`, `worker`, `postgres`, `redis`, optional `minio` / `mailpit` via profiles.

## Run locally

Prerequisites: [Bun](https://bun.sh) 1.3+, Docker.

```bash
docker compose up -d
bun install
bun run dev
```

- Web app: http://localhost:5173
- API: http://localhost:3000
- Health: http://localhost:3000/health
- OpenAPI: http://localhost:3000/docs
- MinIO console: http://localhost:9001 (`minio` / `minioadmin`, bucket `crm`). The compose file uses `bitnamilegacy/minio` because the official MinIO images are no longer anonymously pullable.
- Mailpit: http://localhost:8025
- Auth: Better Auth cookie sessions at `/api/auth/*` (sign-up, sign-in, verify, reset, optional TOTP)
- Web auth: `/sign-in`, `/sign-up`, `/onboarding`, settings members/roles, `/invite/accept`

`bun run dev` waits for Postgres, creates the `crm_migrator` and `crm_app` roles if needed, applies migrations, then starts the API and the web app. Defaults match `docker-compose.yml`, so a `.env` file is optional. Copy `.env.example` to `.env` when you need to override them. Set a strong `AUTH_SECRET` (32+ chars) outside local development.

## Scripts

| Command              | What it does                              |
| -------------------- | ----------------------------------------- |
| `bun run dev`        | Migrate, then run the API and the web app |
| `bun run build`      | Build every package                       |
| `bun run typecheck`  | Typecheck every package                   |
| `bun run lint`       | Prettier and ESLint                       |
| `bun run test`       | Migrate, then unit and API tests          |
| `bun run db:migrate` | Create roles, migrate, grant `crm_app`    |

## Local services

| Service  | Port | Purpose                    |
| -------- | ---- | -------------------------- |
| Postgres | 5432 | Database `crm`             |
| Redis    | 6379 | Cache and future job queue |
| MinIO    | 9000 | S3-compatible file storage |
| Mailpit  | 1025 | SMTP catcher (UI on 8025)  |

## Database roles

| Role           | Used by     | Privileges                                    |
| -------------- | ----------- | --------------------------------------------- |
| `postgres`     | Docker init | Superuser. Not used by the API.               |
| `crm_migrator` | Migrations  | Owns tables. Bypasses RLS as the table owner. |
| `crm_app`      | API         | DML only. `NOBYPASSRLS`. Subject to RLS.      |

`withWorkspace(workspaceId, fn)` opens a transaction, sets `app.workspace_id` for that transaction, and passes the Drizzle transaction to `fn`. Policies on business tables allow `crm_app` to see only the current workspace. `withUser(userId, fn)` sets `app.user_id` so a user can list their own memberships across workspaces.

The tenant-isolation test checks that `crm_app` with workspace A cannot read workspace B's memberships, roles, invitations, permissions, audit logs, object/field definitions, or records. API e2e covers sign-up → workspace → invite → accept, Member 403 on admin endpoints, and metadata/records CRUD (custom Properties object, validation errors, field visibility).

## Phase 3: metadata and records

- Metadata (admins): `GET/POST/PATCH/DELETE /objects`, `…/fields`
- Records: `GET/POST/PATCH/DELETE /objects/:apiName/records`
- Filter DSL query param `filter` (JSON), sort, cursor pagination, full-text `q`
- Perf smoke (1M rows): `bun --filter @cragfoge/db perf:records`
  - Local result (this machine): list p95 **1.4 ms**, filter p95 **1.6 ms**, sort p95 **146.3 ms** (budget 300 ms)

## Phase 4: views, files, exports, search, bulk ops

- Metadata reads are permission-scoped, not admin-only: `GET /objects`, `GET /objects/:apiName`,
  and `GET /objects/:apiName/fields` return only objects the caller can read and fields the caller
  can see (fields hidden by role are omitted; visible fields carry a `visibility: 'read' | 'write'`).
  Mutations (`POST/PATCH/DELETE /objects…`) stay admin-gated.
- Views: `GET/POST/PATCH/DELETE /objects/:apiName/views` — saved filter/sort/column sets. A view is
  either private (only its owner sees or edits it) or shared (every member with object read access
  sees it; only the owner or a workspace admin/owner can edit or delete it).
- Files: `GET/POST /objects/:apiName/records/:recordId/files`,
  `DELETE …/files/:fileId` — uploads are a JSON body `{ name, mimeType, data }` with `data` as
  base64 (kept under `MAX_FILE_SIZE_BYTES`, 8 MB), stored in the S3-compatible bucket (`S3_*` env
  vars; MinIO locally) and addressed by a generated `storageKey`. Requires object update permission
  on the parent record; deletes are soft (`deleted_at`) and also remove the S3 object.
- Exports: `POST /objects/:apiName/exports` enqueues a CSV export job (columns/filter/sort);
  `GET …/exports/:jobId` polls status; `GET …/exports/:jobId/download` streams the finished CSV.
  Jobs run on a BullMQ queue in production and inline (synchronously) when `NODE_ENV=test`, so e2e
  tests can assert on a `completed` job immediately. On completion the owner gets an email with the
  download link. Relation fields cannot be exported; the CSV column list is validated against
  visible, non-relation fields plus `name`/`owner_id`/`created_at`/`updated_at`.
- Search: `GET /search?q=` — full-text search across every object the caller can read, honoring
  "own" scope, returning `{ objectApiName, objectLabel, recordId, name }[]`.
- Bulk record ops: `POST /objects/:apiName/records/bulk-update`,
  `POST /objects/:apiName/records/bulk-delete` — best-effort per-id application of the existing
  single-record update/delete logic (so validation, permissions, and audit logging are unchanged);
  responds with `{ succeededIds, errors }`.
- Member picker: `GET /workspace/members` — any workspace member (not just admins) can list
  `{ id, name, email }` for every member, e.g. to populate an owner/assignee picker.

### Phase 6 — Public API, webhooks, automations

- API keys (admin): `POST/GET/DELETE /api-keys` — name + per-object `read`/`write` scopes.
  Raw key (`cfk_<prefix>_<secret>`) is shown once; only a SHA-256 hash is stored.
  Authenticate with `Authorization: Bearer <key>` and `X-Workspace-Id`. Per-key Redis rate
  limit (default 60/min). Read-only scopes return **403** on writes.
- Public OpenAPI: cookie docs stay at `/docs`; Bearer-focused public docs at `/docs/public`
  (JSON at `/docs/public-json`).
- Outgoing webhooks (admin): `POST/GET/PATCH/DELETE /webhooks`, delivery log at
  `GET /webhooks/:id/deliveries`, manual resend at
  `POST /webhooks/:id/deliveries/:deliveryId/resend`. Events:
  `record.created|updated|deleted|stage_changed`, `activity.created`. Deliveries use BullMQ
  (max 8 attempts, exponential backoff; inline when `NODE_ENV=test`) with
  `X-Cragfoge-Signature: sha256=<hmac>`. A subscription that exhausts retries is auto-disabled.
- Automations (admin): `POST/GET/PATCH/DELETE /automations`, runs at `GET /automations/:id/runs`.
  Triggers: record created, field changed, stage changed, date reached (daily scan).
  Conditions reuse the list-view filter DSL. Actions: update field, create task, send email
  (`{{field}}` templates), call webhook. Loop protection: max 5 runs per automation/record/minute.
- Activities (minimal): `GET/POST /objects/:apiName/records/:recordId/activities` — tasks used by
  automations and the record Activity tab.

### Phase 7 — Billing (cloud) and licensing (self-host)

Mode is chosen by `DEPLOYMENT_MODE=cloud | selfhost` (default **selfhost**). The rest of the
app uses `EntitlementsService` (`can('invite_member')`, `seatLimit()`, `isReadOnly()`).

**Cloud (Stripe)**

- 14-day trial on workspace create (no card). Checkout via Stripe Checkout; manage via Customer Portal.
- Per-seat subscription (`STRIPE_PRICE_ID`); quantity syncs when members join/leave (proration on).
- Webhooks at `POST /billing/webhooks/stripe` (signature verified, idempotent by event id):
  `checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.payment_failed`.
- States: `trialing`, `active`, `past_due` (full access 7 days + banner), `canceled` (read-only;
  exports still allowed).

**Self-host (license keys)**

- Signed Ed25519 license blob `{ licensee, seats, expires_at, issued_at }`. App ships only
  `LICENSE_PUBLIC_KEY`. Generate with `bun --filter @cragfoge/api generate-license` and
  `LICENSE_PRIVATE_KEY` (never commit the private key).
- Without a valid license: free mode, 3-user seat limit. Over limit: block invites + banner.
- Activate at Settings → Billing (`POST /billing/license`).

In selfhost mode Stripe is not constructed and Stripe env vars are not required.

### Phase 8 — Self-host packaging, onboarding, launch hardening

- Production images: `apps/api/Dockerfile`, `apps/web/Dockerfile` (nginx serves the SPA and proxies `/api`).
- Compose: [`deploy/docker-compose.selfhost.yml`](deploy/docker-compose.selfhost.yml) with `api` / `worker` (`PROCESS_ROLE`), Postgres, Redis, optional MinIO/Mailpit profiles.
- Migrations on API start with a Postgres advisory lock; see [`deploy/BACKUP.md`](deploy/BACKUP.md) and [`deploy/UPGRADE.md`](deploy/UPGRADE.md).
- Industry templates in [`packages/shared/src/templates`](packages/shared/src/templates) (also copied under `packages/shared/templates`).
- Dashboard getting-started checklist; GDPR person export/erase; workspace 30-day grace delete.
- Ops: [`deploy/SECURITY_REVIEW.md`](deploy/SECURITY_REVIEW.md), [`deploy/OBSERVABILITY.md`](deploy/OBSERVABILITY.md), [`deploy/LOAD_TEST.md`](deploy/LOAD_TEST.md) (k6).

### Records UI (web)

Metadata-driven UI — no hard-coded screens per object:

- Sidebar lists readable objects (system + custom) with icons
- List view: virtualized TanStack Table, typed cells/inline editors, filter builder → Phase 3
  filter DSL, sort, column show/hide/reorder, saved views, bulk edit/delete, CSV export job
- Record page: name/owner, inline fields, related records, activity tasks, files tab
- Create/edit forms from field definitions + `buildRecordSchema` (same Zod as the API)
- Settings → Objects & fields, Billing, API keys, webhooks (with delivery log / resend), automations
- Global search: Cmd/Ctrl+K across readable objects

Playwright e2e (API + web must already be running via `bun run dev`):

```bash
bunx playwright install chromium   # once
bun --filter @cragfoge/web e2e
```

## Tests

Start Docker first, then:

```bash
bun run test
```

If you change `docker/postgres/init-roles.sql` after the first boot, recreate the volume:

```bash
docker compose down -v
docker compose up -d
```
