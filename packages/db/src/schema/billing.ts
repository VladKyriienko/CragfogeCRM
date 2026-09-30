import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Idempotency store for inbound Stripe webhook events (instance-level, no RLS). */
export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  eventId: text('event_id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

/**
 * Active self-host license (singleton). Instance-level — no workspace_id / RLS.
 * Verified offline with LICENSE_PUBLIC_KEY (Ed25519).
 */
export const instanceLicense = pgTable('instance_license', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Full signed license blob (`base64url(json).base64url(sig)`). */
  payload: text('payload').notNull(),
  licensee: text('licensee').notNull(),
  seats: integer('seats').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});
