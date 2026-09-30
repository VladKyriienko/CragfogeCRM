import { foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { objectDefinitions } from './objects';
import { workspaceIsolationPolicy } from './policies';
import { users } from './users';
import { workspaces } from './workspaces';

export const exportJobStatusValues = ['pending', 'processing', 'completed', 'failed'] as const;
export type ExportJobStatus = (typeof exportJobStatusValues)[number];

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('pending').$type<ExportJobStatus>(),
    filter: jsonb('filter').$type<Record<string, unknown> | null>(),
    sort: jsonb('sort').$type<Record<string, unknown> | null>(),
    columns: jsonb('columns').$type<string[]>().notNull().default([]),
    // Not FK-constrained to `files`: `files` rows always belong to a record,
    // while an export artifact is not attached to any single record. The
    // generated CSV is addressed by `downloadPath` (its S3 storage key)
    // instead. Reserved for a future export/attachment unification.
    fileId: uuid('file_id'),
    downloadPath: text('download_path'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      name: 'export_jobs_object_workspace_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    index('export_jobs_workspace_object_idx').on(table.workspaceId, table.objectId),
    index('export_jobs_owner_idx').on(table.workspaceId, table.ownerId),
    workspaceIsolationPolicy('export_jobs_workspace_isolation', table.workspaceId),
  ],
);
