import { z } from 'zod';

const emptyToUndefined = (value: unknown) =>
  value === '' || value === undefined ? undefined : value;

/**
 * Dev/test Ed25519 public key (SPKI DER, base64). Matching private key lives only in
 * `scripts/generate-license.ts` helpers / test fixtures — never ship the private key.
 */
export const DEV_LICENSE_PUBLIC_KEY =
  'MCowBQYDK2VwAyEAIcPFud0rsovYyM/OW4on1lJ/5tN9VWMhc5N+qnmE3aQ=';

const baseEnvSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  API_HOST: z.preprocess(emptyToUndefined, z.string().min(1).default('0.0.0.0')),
  API_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(3000)),
  LOG_LEVEL: z.preprocess(
    emptyToUndefined,
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ),
  WEB_ORIGIN: z.preprocess(emptyToUndefined, z.string().min(1).default('http://localhost:5173')),
  API_BASE_URL: z.preprocess(emptyToUndefined, z.string().min(1).default('http://localhost:3000')),
  AUTH_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(32).default('dev-only-auth-secret-change-me-32chars'),
  ),
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default('postgresql://crm_app:crm_app@localhost:5432/crm'),
  ),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().min(1).default('redis://localhost:6379')),
  S3_ENDPOINT: z.preprocess(emptyToUndefined, z.string().min(1).default('http://localhost:9000')),
  S3_REGION: z.preprocess(emptyToUndefined, z.string().min(1).default('us-east-1')),
  S3_BUCKET: z.preprocess(emptyToUndefined, z.string().min(1).default('crm')),
  S3_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, z.string().min(1).default('minio')),
  S3_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).default('minioadmin')),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).default('localhost')),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(1025)),
  SMTP_FROM: z.preprocess(emptyToUndefined, z.string().min(1).default('noreply@localhost')),
  /** Sliding window length for the global API rate limit. */
  RATE_LIMIT_TTL_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(60_000),
  ),
  /**
   * Max requests per IP per TTL. Development defaults high so the chatty Records UI
   * (and HMR/Strict Mode) do not trip 429s; production stays conservative.
   */
  RATE_LIMIT_MAX: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  /** Sliding window for per-API-key rate limits. */
  API_KEY_RATE_LIMIT_TTL_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(60_000),
  ),
  /** Max requests per API key per TTL. */
  API_KEY_RATE_LIMIT_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().default(60),
  ),
  DEPLOYMENT_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(['cloud', 'selfhost']).default('selfhost'),
  ),
  STRIPE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STRIPE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STRIPE_PRICE_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  LICENSE_PUBLIC_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /**
   * Which BullMQ responsibilities this process takes:
   * - `api` — HTTP + enqueue only
   * - `worker` — consume queues only
   * - `all` — both (local `bun run dev` default)
   */
  PROCESS_ROLE: z.preprocess(emptyToUndefined, z.enum(['api', 'worker', 'all']).default('all')),
  /** Optional Sentry DSN. Empty disables the SDK. */
  SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /**
   * Override Better Auth email verification. When unset, verification is required
   * only in production (see createAuth).
   */
  AUTH_REQUIRE_EMAIL_VERIFICATION: z.preprocess((value) => {
    if (value === '' || value === undefined) return undefined;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  }, z.boolean().optional()),
});

export const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (data.DEPLOYMENT_MODE === 'cloud') {
    if (!data.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_SECRET_KEY'],
        message: 'Required when DEPLOYMENT_MODE=cloud',
      });
    }
    if (!data.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_WEBHOOK_SECRET'],
        message: 'Required when DEPLOYMENT_MODE=cloud',
      });
    }
    if (!data.STRIPE_PRICE_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_PRICE_ID'],
        message: 'Required when DEPLOYMENT_MODE=cloud',
      });
    }
  }

  if (
    data.DEPLOYMENT_MODE === 'selfhost' &&
    data.NODE_ENV === 'production' &&
    !data.LICENSE_PUBLIC_KEY
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['LICENSE_PUBLIC_KEY'],
      message: 'Required when DEPLOYMENT_MODE=selfhost in production',
    });
  }
});

type ParsedEnv = z.infer<typeof baseEnvSchema>;

export type Env = Omit<
  ParsedEnv,
  | 'RATE_LIMIT_MAX'
  | 'LICENSE_PUBLIC_KEY'
  | 'STRIPE_SECRET_KEY'
  | 'STRIPE_WEBHOOK_SECRET'
  | 'STRIPE_PRICE_ID'
  | 'SENTRY_DSN'
> & {
  RATE_LIMIT_MAX: number;
  LICENSE_PUBLIC_KEY: string;
  STRIPE_SECRET_KEY: string | undefined;
  STRIPE_WEBHOOK_SECRET: string | undefined;
  STRIPE_PRICE_ID: string | undefined;
  SENTRY_DSN: string | undefined;
};

export function shouldRunWorkers(env: Env): boolean {
  return env.PROCESS_ROLE === 'worker' || env.PROCESS_ROLE === 'all';
}

export function shouldOwnQueues(env: Env): boolean {
  return env.PROCESS_ROLE === 'api' || env.PROCESS_ROLE === 'all';
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }
  const data = parsed.data;
  const rateLimitMax =
    data.RATE_LIMIT_MAX ??
    (data.NODE_ENV === 'production' ? 300 : data.NODE_ENV === 'test' ? 10_000 : 2_000);

  const licensePublicKey =
    data.LICENSE_PUBLIC_KEY ??
    (data.DEPLOYMENT_MODE === 'selfhost' && data.NODE_ENV !== 'production'
      ? DEV_LICENSE_PUBLIC_KEY
      : '');

  return {
    ...data,
    RATE_LIMIT_MAX: rateLimitMax,
    LICENSE_PUBLIC_KEY: licensePublicKey,
    STRIPE_SECRET_KEY: data.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: data.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID: data.STRIPE_PRICE_ID,
    SENTRY_DSN: data.SENTRY_DSN,
  };
}
