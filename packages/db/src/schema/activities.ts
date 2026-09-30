import { foreignKey, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { objectDefinitions } from './objects';
import { workspaceIsolationPolicy } from './policies';
import { records } from './records';
import { users } from './users';
import { workspaces } from './workspaces';

export const activityTypeValues = ['task', 'note'] as const;
export type ActivityType = (typeof activityTypeValues)[number];

export const activityStatusValues = ['open', 'done', 'cancelled'] as const;
export type ActivityStatus = (typeof activityStatusValues)[number];

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    recordId: uuid('record_id').notNull(),
    objectId: uuid('object_id').notNull(),
    type: text('type').notNull().$type<ActivityType>(),
    subject: text('subject').notNull(),
    body: text('body'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    status: text('status').notNull().default('open').$type<ActivityStatus>(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'activities_record_workspace_fk',
      columns: [table.recordId, table.workspaceId],
      foreignColumns: [records.id, records.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'activities_object_workspace_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    index('activities_record_idx').on(table.workspaceId, table.recordId),
    index('activities_owner_idx').on(table.workspaceId, table.ownerId),
    workspaceIsolationPolicy('activities_workspace_isolation', table.workspaceId),
  ],
);
