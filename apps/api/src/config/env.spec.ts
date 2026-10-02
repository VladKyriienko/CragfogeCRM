import { describe, expect, it } from 'vitest';
import { DEV_LICENSE_PUBLIC_KEY, loadEnv, productionWarnings } from './env';

const base = {
  NODE_ENV: 'test',
  AUTH_SECRET: 'dev-only-auth-secret-change-me-32chars',
} as const;

describe('loadEnv deployment mode', () => {
  it('accepts selfhost without Stripe env vars', () => {
    const env = loadEnv({
      ...base,
      DEPLOYMENT_MODE: 'selfhost',
    });
    expect(env.DEPLOYMENT_MODE).toBe('selfhost');
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.LICENSE_PUBLIC_KEY.length).toBeGreaterThan(0);
  });

  it('requires Stripe vars in cloud mode', () => {
    expect(() =>
      loadEnv({
        ...base,
        DEPLOYMENT_MODE: 'cloud',
      }),
    ).toThrow(/STRIPE_SECRET_KEY/);
  });

  it('accepts cloud mode when Stripe vars are set', () => {
    const env = loadEnv({
      ...base,
      DEPLOYMENT_MODE: 'cloud',
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      STRIPE_PRICE_ID: 'price_x',
    });
    expect(env.DEPLOYMENT_MODE).toBe('cloud');
    expect(env.STRIPE_SECRET_KEY).toBe('sk_test_x');
  });
});

describe('loadEnv production secrets', () => {
  const production = {
    NODE_ENV: 'production',
    DEPLOYMENT_MODE: 'selfhost',
    LICENSE_PUBLIC_KEY: 'custom-public-key',
    AUTH_SECRET: 'k3Jx9vQ2mZ7pL5tR8wN4bY6cH1dF0gAe',
    DATABASE_URL: 'postgresql://crm_app:Zq8!rT2vXp@db:5432/crm',
    S3_SECRET_ACCESS_KEY: 'u7Wm2Hc9Ts4Lk1Qe',
  } as const;

  it('accepts strong secrets', () => {
    expect(() => loadEnv(production)).not.toThrow();
  });

  it('rejects the default and placeholder AUTH_SECRET', () => {
    expect(() => loadEnv({ ...production, AUTH_SECRET: '' })).toThrow(/AUTH_SECRET/);
    expect(() =>
      loadEnv({ ...production, AUTH_SECRET: 'change-me-to-a-long-random-secret-32+' }),
    ).toThrow(/AUTH_SECRET/);
  });

  it('rejects the default crm_app database password, also when DATABASE_URL is omitted', () => {
    expect(() =>
      loadEnv({ ...production, DATABASE_URL: 'postgresql://crm_app:crm_app@db:5432/crm' }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      loadEnv({ ...production, DATABASE_URL: 'postgresql://crm_app:change-me-pg@db:5432/crm' }),
    ).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...production, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('rejects the default MinIO password', () => {
    expect(() => loadEnv({ ...production, S3_SECRET_ACCESS_KEY: 'minioadmin' })).toThrow(
      /S3_SECRET_ACCESS_KEY/,
    );
  });

  it('reports every weak value at once', () => {
    expect(() =>
      loadEnv({ ...production, AUTH_SECRET: '', DATABASE_URL: '', S3_SECRET_ACCESS_KEY: '' }),
    ).toThrow(/AUTH_SECRET[\s\S]*DATABASE_URL[\s\S]*S3_SECRET_ACCESS_KEY/);
  });

  it('does not apply to development and test', () => {
    expect(() => loadEnv({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => loadEnv({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('does not echo secret values in the error', () => {
    try {
      loadEnv({ ...production, AUTH_SECRET: 'change-me-to-a-long-random-secret-32+' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('change-me-to-a-long-random-secret');
    }
  });

  it('warns when production self-host uses the development licence key', () => {
    const env = loadEnv({ ...production, LICENSE_PUBLIC_KEY: DEV_LICENSE_PUBLIC_KEY });
    expect(productionWarnings(env)).toHaveLength(1);
    expect(productionWarnings(loadEnv(production))).toEqual([]);
  });
});

describe('loadEnv TRUST_PROXY', () => {
  it('defaults to no proxy and accepts a hop count', () => {
    expect(loadEnv(base).TRUST_PROXY).toBe(0);
    expect(loadEnv({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
  });

  it('rejects negative or non-numeric values', () => {
    expect(() => loadEnv({ ...base, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
    expect(() => loadEnv({ ...base, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });
});
