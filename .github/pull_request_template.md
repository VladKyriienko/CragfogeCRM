## What and why

<!-- What changes, and the reason for it. Link the issue or plan phase if any. -->

## How it was verified

- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] New or updated tests cover the change

<!-- Paste anything else you ran (manual steps, queries, screenshots). -->

## Risks

<!-- Tenant isolation / RLS, permissions, migrations, env vars, breaking API changes. Write "none" if none. -->

## Checklist

- [ ] New business tables have `workspace_id` and RLS (enabled and forced)
- [ ] Migrations are new files; no applied migration was edited
- [ ] User-facing strings use `t('...')`; `.env.example` files are in sync
- [ ] Screenshots attached for UI changes
