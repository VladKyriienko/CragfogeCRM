import { integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const billingStatusValues = ['none', 'trialing', 'active', 'past_due', 'canceled'] as const;
export type BillingStatus = (typeof billingStatusValues)[number];

export type OnboardingChecklistState = {
  dismissedSteps?: string[];
  dismissedAll?: boolean;
  completedSteps?: string[];
};

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('UTC'),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  locale: text('locale').notNull().default('en'),
  plan: text('plan').notNull().default('free'),
  billingStatus: text('billing_status').notNull().default('none').$type<BillingStatus>(),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true, mode: 'date' }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  pastDueSince: timestamp('past_due_since', { withTimezone: true, mode: 'date' }),
  metadataVersion: integer('metadata_version').notNull().default(1),
  onboardingChecklist: jsonb('onboarding_checklist')
    .$type<OnboardingChecklistState>()
    .notNull()
    .default({}),
  deletionScheduledAt: timestamp('deletion_scheduled_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
