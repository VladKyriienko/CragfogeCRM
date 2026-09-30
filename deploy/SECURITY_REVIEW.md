# Security review (Phase 8)

Checked against the project security rules in `.cursor/rules/crm-project.mdc`.

## Compliant

| Rule                                                                      | Status                                |
| ------------------------------------------------------------------------- | ------------------------------------- |
| API uses `crm_app` with `NOBYPASSRLS`; migrations use `crm_migrator`      | OK                                    |
| Business tables have RLS + `withWorkspace` / `SET LOCAL app.workspace_id` | OK                                    |
| API keys stored as SHA-256 hash; raw shown once                           | OK                                    |
| Outbound webhooks HMAC-SHA256 (`X-Cragfoge-Signature`)                    | OK                                    |
| Stripe webhook signature verified                                         | OK                                    |
| Auth + global API rate limits                                             | OK                                    |
| Session cookies `httpOnly`, `sameSite=lax`, `secure` in production        | OK                                    |
| Pino redacts `authorization` and `cookie`                                 | OK                                    |
| Tenant isolation automated test                                           | OK (`packages/db/src/tenant.test.ts`) |

## Findings (not all fixed in Phase 8)

| Finding                                                                      | Severity | Notes / follow-up                                                                                                    |
| ---------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| No explicit CSRF token middleware                                            | Medium   | Relies on SameSite cookies + CORS origin. Add double-submit or Better Auth CSRF if cookie clients expand beyond SPA. |
| Webhook `signing_secret` stored plaintext                                    | Medium   | Shown once on create but persisted raw. Hash at rest like API keys.                                                  |
| API key context uses empty `fieldPermissions` → default **write** visibility | Medium   | API keys bypass field-level hide. Inherit role field permissions or default deny.                                    |
| Per-API-key Redis rate limit **fail-open** when Redis is down                | Low      | Prefer fail-closed for public API keys.                                                                              |
| `workspaces` / `users` / Better Auth tables lack RLS                         | Low      | App-layer checks only; acceptable short-term, document threat model.                                                 |
| Sentry was unwired                                                           | Low      | **Fixed in Phase 8** — optional `SENTRY_DSN` / `VITE_SENTRY_DSN`.                                                    |
| Default/dev secrets in examples                                              | Info     | Documented; must rotate for real installs (`AUTH_SECRET`, DB, MinIO).                                                |

## Phase 8 remediations shipped

- Optional Sentry init (API + web) behind DSN env vars.
- Self-host compose runs API as non-root; runtime DB URL is `crm_app`.
- Migrations on start use advisory lock; admin URL only for migrate entrypoint.
