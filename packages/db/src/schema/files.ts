import {
  bigint,
  foreignKey,
  index,
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

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    recordId: uuid('record_id').notNull(),
    objectId: uuid('object_id').notNull(),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      name: 'files_record_workspace_fk',
      columns: [table.recordId, table.workspaceId],
      foreignColumns: [records.id, records.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'files_object_workspace_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    unique('files_id_workspace_unique').on(table.id, table.workspaceId),
    index('files_record_idx').on(table.workspaceId, table.recordId),
    index('files_workspace_id_idx').on(table.workspaceId),
    workspaceIsolationPolicy('files_workspace_isolation', table.workspaceId),
  ],
);
