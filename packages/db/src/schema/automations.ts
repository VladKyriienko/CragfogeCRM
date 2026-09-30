import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { objectDefinitions } from './objects';
import { workspaceIsolationPolicy } from './policies';
import { records } from './records';
import { users } from './users';
import { workspaces } from './workspaces';

export const automationRunStatusValues = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
] as const;
export type AutomationRunStatus = (typeof automationRunStatusValues)[number];

export const automations = pgTable(
  'automations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    name: text('name').notNull(),
    trigger: jsonb('trigger').$type<Record<string, unknown>>().notNull(),
    conditions: jsonb('conditions').$type<Record<string, unknown> | null>(),
    actions: jsonb('actions').$type<Record<string, unknown>[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'automations_object_workspace_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    unique('automations_id_workspace_unique').on(table.id, table.workspaceId),
    index('automations_workspace_object_idx').on(table.workspaceId, table.objectId),
    workspaceIsolationPolicy('automations_workspace_isolation', table.workspaceId),
  ],
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    automationId: uuid('automation_id').notNull(),
    recordId: uuid('record_id'),
    triggerEvent: text('trigger_event').notNull(),
    status: text('status').notNull().default('pending').$type<AutomationRunStatus>(),
    actionResults: jsonb('action_results').$type<Record<string, unknown>[]>().notNull().default([]),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'automation_runs_automation_workspace_fk',
      columns: [table.automationId, table.workspaceId],
      foreignColumns: [automations.id, automations.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'automation_runs_record_workspace_fk',
      columns: [table.recordId, table.workspaceId],
      foreignColumns: [records.id, records.workspaceId],
    }).onDelete('set null'),
    index('automation_runs_automation_idx').on(table.workspaceId, table.automationId),
    index('automation_runs_record_idx').on(table.workspaceId, table.recordId),
    workspaceIsolationPolicy('automation_runs_workspace_isolation', table.workspaceId),
  ],
);
