import { randomUUID } from 'node:crypto';
import {
  getAppDb,
  instanceLicense,
  memberships,
  roles,
  users,
  withWorkspace,
  workspaces,
} from '@cragfoge/db';
import { afterAll, describe, expect, it } from 'vitest';
import { DEV_LICENSE_PUBLIC_KEY, type Env } from '../config/env';
import { EntitlementsService } from './entitlements.service';
import {
  DEV_LICENSE_PRIVATE_KEY,
  FREE_MODE_SEAT_LIMIT,
  PAST_DUE_GRACE_MS,
  signLicensePayload,
} from './license-crypto';
import { LicenseService } from './license.service';

function envFor(mode: 'cloud' | 'selfhost'): Env {
  return {
    NODE_ENV: 'test',
    API_HOST: '0.0.0.0',
    API_PORT: 3000,
    LOG_LEVEL: 'silent',
    WEB_ORIGIN: 'http://localhost:5173',
    API_BASE_URL: 'http://localhost:3000',
    AUTH_SECRET: 'dev-only-auth-secret-change-me-32chars',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://crm_app:crm_app@localhost:5432/crm',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'crm',
    S3_ACCESS_KEY_ID: 'minio',
    S3_SECRET_ACCESS_KEY: 'minioadmin',
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_FROM: 'noreply@localhost',
    RATE_LIMIT_TTL_MS: 60_000,
    RATE_LIMIT_MAX: 10_000,
    API_KEY_RATE_LIMIT_TTL_MS: 60_000,
    API_KEY_RATE_LIMIT_MAX: 60,
    DEPLOYMENT_MODE: mode,
    STRIPE_SECRET_KEY: mode === 'cloud' ? 'sk_test_x' : undefined,
    STRIPE_WEBHOOK_SECRET: mode === 'cloud' ? 'whsec_x' : undefined,
    STRIPE_PRICE_ID: mode === 'cloud' ? 'price_x' : undefined,
    LICENSE_PUBLIC_KEY: DEV_LICENSE_PUBLIC_KEY,
    PROCESS_ROLE: 'all',
    SENTRY_DSN: undefined,
  };
}

async function seedWorkspace(opts: {
  billingStatus?: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  trialEndsAt?: Date | null;
  pastDueSince?: Date | null;
  stripeSubscriptionId?: string | null;
}) {
  const db = getAppDb();
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();

  await db.insert(users).values({
    id: userId,
    name: 'Owner',
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Entitlements WS',
    slug: `ent-${workspaceId}`,
    plan: 'pro',
    billingStatus: opts.billingStatus ?? 'none',
    trialEndsAt: opts.trialEndsAt ?? null,
    pastDueSince: opts.pastDueSince ?? null,
    stripeSubscriptionId: opts.stripeSubscriptionId ?? null,
  });
  await withWorkspace(
    workspaceId,
    async (tx) => {
      await tx.insert(roles).values({
        id: roleId,
        workspaceId,
        name: 'Owner',
        key: 'owner',
        isSystem: true,
      });
      await tx.insert(memberships).values({
        workspaceId,
        userId,
        roleId,
      });
    },
    { userId },
  );

  return { workspaceId, userId };
}

describe('EntitlementsService', () => {
  const db = getAppDb();

  afterAll(async () => {
    await db.delete(instanceLicense);
  });

  it('selfhost free mode limits seats to 3', async () => {
    const licenses = new LicenseService(db, envFor('selfhost'));
    await licenses.clearForTests();
    const entitlements = new EntitlementsService(db, envFor('selfhost'), licenses);
    const { workspaceId, userId } = await seedWorkspace({});

    const status = await entitlements.getStatus(workspaceId, userId);
    expect(status.seatLimit).toBe(FREE_MODE_SEAT_LIMIT);
    expect(status.hasValidLicense).toBe(false);
    expect(await entitlements.can(workspaceId, 'invite_member', userId)).toBe(true);
  });

  it('selfhost licensed mode uses license seats', async () => {
    const licenses = new LicenseService(db, envFor('selfhost'));
    await licenses.clearForTests();
    const key = signLicensePayload(
      {
        licensee: 'Licensed Co',
        seats: 8,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        issued_at: new Date().toISOString(),
      },
      DEV_LICENSE_PRIVATE_KEY,
    );
    await licenses.activate({ licenseKey: key });

    const entitlements = new EntitlementsService(db, envFor('selfhost'), licenses);
    const { workspaceId, userId } = await seedWorkspace({});
    const status = await entitlements.getStatus(workspaceId, userId);
    expect(status.seatLimit).toBe(8);
    expect(status.hasValidLicense).toBe(true);
  });

  it('cloud past_due within grace is not read-only', async () => {
    const licenses = new LicenseService(db, envFor('cloud'));
    const entitlements = new EntitlementsService(db, envFor('cloud'), licenses);
    const { workspaceId, userId } = await seedWorkspace({
      billingStatus: 'past_due',
      pastDueSince: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      stripeSubscriptionId: 'sub_x',
    });
    const status = await entitlements.getStatus(workspaceId, userId);
    expect(status.isReadOnly).toBe(false);
    expect(status.pastDueGraceActive).toBe(true);
  });

  it('cloud past_due after grace is read-only', async () => {
    const licenses = new LicenseService(db, envFor('cloud'));
    const entitlements = new EntitlementsService(db, envFor('cloud'), licenses);
    const { workspaceId, userId } = await seedWorkspace({
      billingStatus: 'past_due',
      pastDueSince: new Date(Date.now() - PAST_DUE_GRACE_MS - 60_000),
      stripeSubscriptionId: 'sub_y',
    });
    const status = await entitlements.getStatus(workspaceId, userId);
    expect(status.isReadOnly).toBe(true);
    expect(await entitlements.can(workspaceId, 'invite_member', userId)).toBe(false);
  });

  it('cloud canceled is read-only', async () => {
    const licenses = new LicenseService(db, envFor('cloud'));
    const entitlements = new EntitlementsService(db, envFor('cloud'), licenses);
    const { workspaceId, userId } = await seedWorkspace({ billingStatus: 'canceled' });
    expect(await entitlements.isReadOnly(workspaceId, userId)).toBe(true);
  });

  it('cloud expired trial without subscription is read-only', async () => {
    const licenses = new LicenseService(db, envFor('cloud'));
    const entitlements = new EntitlementsService(db, envFor('cloud'), licenses);
    const { workspaceId, userId } = await seedWorkspace({
      billingStatus: 'trialing',
      trialEndsAt: new Date(Date.now() - 60_000),
      stripeSubscriptionId: null,
    });
    const status = await entitlements.getStatus(workspaceId, userId);
    expect(status.isReadOnly).toBe(true);
    expect(status.billingStatus).toBe('canceled');
  });
});
