import { randomUUID } from 'node:crypto';
import { eq, getAppDb, stripeWebhookEvents, workspaces } from '@cragfoge/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { StripeBillingService } from './stripe-billing.service';
import type { Env } from '../config/env';
import type { EntitlementsService } from './entitlements.service';

function cloudEnv(): Env {
  return {
    NODE_ENV: 'test',
    API_HOST: '0.0.0.0',
    API_PORT: 3000,
    LOG_LEVEL: 'silent',
    WEB_ORIGIN: 'http://localhost:5173',
    API_BASE_URL: 'http://localhost:3000',
    TRUST_PROXY: 0,
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
    DEPLOYMENT_MODE: 'cloud',
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_PRICE_ID: 'price_x',
    LICENSE_PUBLIC_KEY: '',
    PROCESS_ROLE: 'all',
    SENTRY_DSN: undefined,
  };
}

function makeEvent(type: Stripe.Event.Type, object: unknown, id?: string): Stripe.Event {
  return {
    id: id ?? `evt_${randomUUID().replace(/-/g, '')}`,
    object: 'event',
    api_version: '2025-01-27.acacia',
    created: Math.floor(Date.now() / 1000),
    data: { object: object as Stripe.Event.Data.Object },
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
  } as Stripe.Event;
}

describe('StripeBillingService webhooks', () => {
  const db = getAppDb();
  let workspaceId: string;
  let service: StripeBillingService;

  beforeAll(() => {
    const entitlements = {
      countMembers: vi.fn(async () => 1),
    } as unknown as EntitlementsService;
    const stripe = {
      webhooks: {
        constructEvent: vi.fn(
          (raw: Buffer, _sig: string, _secret: string) =>
            JSON.parse(raw.toString('utf8')) as Stripe.Event,
        ),
      },
    } as unknown as Stripe;
    service = new StripeBillingService(db, cloudEnv(), entitlements, stripe);
  });

  beforeEach(async () => {
    workspaceId = randomUUID();
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Billing Test',
      slug: `billing-${workspaceId}`,
      plan: 'pro',
      billingStatus: 'trialing',
      trialEndsAt: new Date(Date.now() + 86_400_000),
    });
  });

  afterAll(async () => {
    await db.delete(stripeWebhookEvents);
  });

  it('handles checkout.session.completed', async () => {
    const event = makeEvent('checkout.session.completed', {
      id: 'cs_test_1',
      object: 'checkout.session',
      client_reference_id: workspaceId,
      customer: 'cus_test_1',
      subscription: 'sub_test_1',
      metadata: { workspace_id: workspaceId },
    });

    await service.applyEvent(event);

    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    expect(row?.billingStatus).toBe('active');
    expect(row?.stripeCustomerId).toBe('cus_test_1');
    expect(row?.stripeSubscriptionId).toBe('sub_test_1');
  });

  it('handles customer.subscription.updated → past_due', async () => {
    const customerId = `cus_upd_${workspaceId}`;
    const subscriptionId = `sub_upd_${workspaceId}`;
    await db
      .update(workspaces)
      .set({
        billingStatus: 'active',
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      })
      .where(eq(workspaces.id, workspaceId));

    await service.applyEvent(
      makeEvent('customer.subscription.updated', {
        id: subscriptionId,
        object: 'subscription',
        status: 'past_due',
        customer: customerId,
        metadata: { workspace_id: workspaceId },
      }),
    );

    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    expect(row?.billingStatus).toBe('past_due');
    expect(row?.pastDueSince).toBeTruthy();
  });

  it('handles customer.subscription.deleted', async () => {
    const customerId = `cus_del_${workspaceId}`;
    const subscriptionId = `sub_del_${workspaceId}`;
    await db
      .update(workspaces)
      .set({
        billingStatus: 'active',
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      })
      .where(eq(workspaces.id, workspaceId));

    await service.applyEvent(
      makeEvent('customer.subscription.deleted', {
        id: subscriptionId,
        object: 'subscription',
        status: 'canceled',
        customer: customerId,
        metadata: { workspace_id: workspaceId },
      }),
    );

    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    expect(row?.billingStatus).toBe('canceled');
  });

  it('handles invoice.payment_failed', async () => {
    const customerId = `cus_fail_${workspaceId}`;
    await db
      .update(workspaces)
      .set({
        billingStatus: 'active',
        stripeCustomerId: customerId,
        stripeSubscriptionId: `sub_fail_${workspaceId}`,
      })
      .where(eq(workspaces.id, workspaceId));

    await service.applyEvent(
      makeEvent('invoice.payment_failed', {
        id: `in_fail_${workspaceId}`,
        object: 'invoice',
        customer: customerId,
      }),
    );

    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    expect(row?.billingStatus).toBe('past_due');
    expect(row?.pastDueSince).toBeTruthy();
  });

  it('is idempotent by event id', async () => {
    const eventId = `evt_idem_${randomUUID().replace(/-/g, '')}`;
    const event = makeEvent(
      'checkout.session.completed',
      {
        id: 'cs_idem',
        object: 'checkout.session',
        client_reference_id: workspaceId,
        customer: 'cus_idem',
        subscription: 'sub_idem',
        metadata: { workspace_id: workspaceId },
      },
      eventId,
    );

    const raw = Buffer.from(JSON.stringify(event), 'utf8');
    await service.handleWebhook(raw, 'sig');
    await service.handleWebhook(raw, 'sig');

    const events = await db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, eventId));
    expect(events).toHaveLength(1);
  });
});
