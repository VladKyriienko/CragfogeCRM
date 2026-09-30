import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

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
