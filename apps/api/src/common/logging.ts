import type { Options } from 'pino-http';

/**
 * Paths scrubbed from every request log line. Session cookies are set on sign-in responses
 * and API keys travel in `Authorization`, so both directions are covered.
 */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

/**
 * Verification and reset tokens are delivered as query parameters (`?token=...`), so the
 * query string never goes into the log. The path is enough to trace a request.
 */
export const LOG_SERIALIZERS: NonNullable<Options['serializers']> = {
  req: (req: { id?: unknown; method?: string; url?: string; headers?: unknown }) => ({
    id: req.id,
    method: req.method,
    url: req.url?.split('?')[0],
    headers: req.headers,
  }),
};
