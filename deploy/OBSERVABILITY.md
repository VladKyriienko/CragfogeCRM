# Observability — Sentry and structured logs

## Structured logs (both modes)

The API uses `nestjs-pino` / pino:

- **Development:** pretty single-line transport.
- **Production / self-host:** JSON logs to stdout (no pretty transport).
- Redacts `req.headers.authorization` and `req.headers.cookie`.
- Level from `LOG_LEVEL` (default `info`).

Verify:

```bash
docker compose -f deploy/docker-compose.selfhost.yml logs -f api
# Expect JSON lines with "req", "res", "level", no Cookie/Authorization values.
```

Cloud (process manager) and self-host (Docker) both ship the same logger — only the transport differs by `NODE_ENV`.

## Sentry

| Mode                     | Env var           | Where                                                          |
| ------------------------ | ----------------- | -------------------------------------------------------------- |
| API (cloud or self-host) | `SENTRY_DSN`      | `apps/api` — initialized in `create-app.ts` when set           |
| Web                      | `VITE_SENTRY_DSN` | build-time for Vite; set in the web image build args if needed |

Leave empty to disable.

### Verification

1. Set a project DSN in `.env` / `deploy/.env.selfhost`.
2. Restart API (and rebuild web if using `VITE_SENTRY_DSN`).
3. Trigger a test error (temporary throw in a controller, or `Sentry.captureException(new Error('sentry-smoke'))`).
4. Confirm the event appears in the Sentry project for that environment (`development` / `production` / `test`).
