# Security findings

Status after Phase 1 of the improvement plan. This extends `deploy/SECURITY_REVIEW.md`
(Phase 8 review); entries there are repeated only when their status or severity changed.
"Verified" means I reproduced it in code or with a test in this repository.

## Fixed in Phase 1

| Finding                                                                                                                                      | Severity | Fix                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| Session token written to logs: pino-http logs response headers, so `Set-Cookie` on sign-in reached the log                                   | High     | `LOG_REDACT_PATHS` redacts `Set-Cookie` and `X-Api-Key`; test fails without it |
| Verification and reset tokens logged through `?token=` query strings                                                                         | Medium   | Request serializer drops the query string                                      |
| Production could boot with `.env.example` secrets (`AUTH_SECRET`, `crm_app` password, MinIO password)                                        | High     | `loadEnv` rejects them in production, also when omitted                        |
| Self-host operators could not change database role passwords: `migrate.ts` hard-coded `crm_app`/`crm_migrator` and reset them on every start | High     | Role passwords now come from `DATABASE_URL` and `DATABASE_URL_MIGRATOR`        |
| No security headers on the API (no nosniff, CSP, frame, referrer) and `X-Powered-By` exposed                                                 | Medium   | helmet with a strict CSP for the JSON API, relaxed for `/docs`                 |
| Per-IP rate limit behind nginx saw nginx's IP, so all users shared one bucket                                                                | Medium   | `TRUST_PROXY` hop count; compose sets `1`                                      |
| No HTTP-level proof of tenant isolation                                                                                                      | Medium   | `test/tenant-isolation.e2e.spec.ts` (23 cases, all strict 403/404)             |
| New tables could ship without RLS unnoticed                                                                                                  | Medium   | `packages/db/src/rls-audit.test.ts` reads the live catalog                     |

## RLS audit result

- Every table with `workspace_id` (19) has RLS enabled and a policy for each required command.
  `audit_logs` is append-only by design (SELECT and INSERT only).
- `crm_app` is not superuser, has no `BYPASSRLS`, and owns no tables. Tables are owned by `crm_migrator`.
- Tables without `workspace_id` are listed with a reason in the audit test: `workspaces`, `users`
  and the Better Auth tables, `instance_license`, `stripe_webhook_events`.
- **No table has `FORCE ROW LEVEL SECURITY`.** Today this is covered because the runtime role is not
  the owner. Forcing it would also apply RLS to `crm_migrator`, which breaks the
  `SECURITY DEFINER` function `app_get_invitation_by_token_hash` and any seed or purge that runs
  as the owner without tenant context. Treat as a design decision, not a quick fix.
- Workers (exports, webhooks, automations, purge) use `withWorkspace`. The only `this.db` calls
  outside it are on non-tenant tables (`workspaces`, `instance_license`, `stripe_webhook_events`,
  `users` count) and the invitation lookup function.

## Open, needs a decision or follow-up

| #   | Finding                                                                                                                                                                                                                                                                            | Severity | Notes                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | **API keys ignore field-level permissions.** The API-key request context has an empty `fieldPermissions` map and `fieldVisibility()` defaults to `write`, so a key sees and can write fields that every role has hidden. Verified in `workspace.guard.ts` and `request-context.ts` | High     | Decide what a key inherits: a role, or deny-by-default for any field that some role hides. Then add a test |
| 2   | **Development licence private key is committed** (`license-crypto.ts`) and the self-host example ships the matching public key. Anyone can mint licences for an install that keeps it. Startup now logs a warning                                                                  | High     | Product decision: require a real key in production, or accept that the free tier is unenforced             |
| 3   | Webhook `signing_secret` is stored in plaintext. `SECURITY_REVIEW.md` suggests hashing, but outbound HMAC needs the raw secret, so the fix is encryption at rest with a dedicated key                                                                                              | Medium   | Needs a key-management choice                                                                              |
| 4   | Better Auth rate limiter uses `storage: 'memory'`: per process, reset on restart, not shared between replicas                                                                                                                                                                      | Medium   | Use secondary storage (Redis)                                                                              |
| 5   | Better Auth derives the client IP from `X-Forwarded-For`, and nginx uses `$proxy_add_x_forwarded_for`, so a client can send its own first entry                                                                                                                                    | Medium   | If nginx is the edge, set `X-Forwarded-For $remote_addr`. Depends on your deployment                       |
| 6   | Per-API-key rate limit fails open when Redis is down                                                                                                                                                                                                                               | Low      | Prefer fail-closed for public API keys                                                                     |
| 7   | No CSRF token. Relies on `SameSite=Lax` and CORS pinned to `WEB_ORIGIN`                                                                                                                                                                                                            | Low      | Acceptable for the SPA. Revisit before supporting other cookie clients                                     |
| 8   | Swagger UI at `/docs` (full internal API) is public in production                                                                                                                                                                                                                  | Low      | Consider `DOCS_ENABLED` defaulting to off in production; keep `/docs/public`                               |
| 9   | Uploaded `mimeType` is client-declared and not allow-listed. No file download route was found in `files.controller.ts`, so this only matters once one exists                                                                                                                       | Low      | Add an allow-list and `Content-Disposition: attachment` with the download route                            |
| 10  | `workspaces`, `users` and Better Auth tables have no RLS                                                                                                                                                                                                                           | Low      | Documented in the audit test; access is checked in the application layer                                   |
| 11  | TOTP and password-reset endpoints share the Better Auth defaults; only sign-in, sign-up and reset-request have custom limits                                                                                                                                                       | Low      | Add explicit limits for `/two-factor/*`                                                                    |

## Not verified

- `nginx.conf` and `docker-compose.selfhost.yml` changes: no Docker daemon in the working environment.
- MinIO image replacement (plan 1.1): see the Phase 1 report; I could not reach any registry to check candidates.
- gitleaks result: the CI job is new and informational until its first run.
