import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { objectDefinitions } from './objects';
import { workspaceIsolationPolicy } from './policies';
import { users } from './users';
import { workspaces } from './workspaces';

export const webhookEventValues = [
  'record.created',
  'record.updated',
  'record.deleted',
  'record.stage_changed',
  'activity.created',
] as const;
export type WebhookEvent = (typeof webhookEventValues)[number];

export const webhookDeliveryStatusValues = [
  'pending',
  'delivering',
  'succeeded',
  'failed',
] as const;
export type WebhookDeliveryStatus = (typeof webhookDeliveryStatusValues)[number];

export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    /** Raw signing secret — needed for outbound HMAC; shown once on create. */
    signingSecret: text('signing_secret').notNull(),
    events: jsonb('events').$type<WebhookEvent[]>().notNull().default([]),
    objectId: uuid('object_id'),
    isActive: boolean('is_active').notNull().default(true),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'webhook_subscriptions_object_workspace_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    unique('webhook_subscriptions_id_workspace_unique').on(table.id, table.workspaceId),
    index('webhook_subscriptions_workspace_id_idx').on(table.workspaceId),
    workspaceIsolationPolicy('webhook_subscriptions_workspace_isolation', table.workspaceId),
  ],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').notNull(),
    event: text('event').notNull().$type<WebhookEvent>(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('pending').$type<WebhookDeliveryStatus>(),
    attemptCount: integer('attempt_count').notNull().default(0),
    responseStatus: integer('response_status'),
    responseBodyPreview: text('response_body_preview'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'webhook_deliveries_subscription_workspace_fk',
      columns: [table.subscriptionId, table.workspaceId],
      foreignColumns: [webhookSubscriptions.id, webhookSubscriptions.workspaceId],
    }).onDelete('cascade'),
    index('webhook_deliveries_subscription_idx').on(table.workspaceId, table.subscriptionId),
    index('webhook_deliveries_status_idx').on(table.workspaceId, table.status),
    workspaceIsolationPolicy('webhook_deliveries_workspace_isolation', table.workspaceId),
  ],
);
