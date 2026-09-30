import { sql } from 'drizzle-orm';
import {
  customType,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { fieldDefinitions, objectDefinitions } from './objects';
import { workspaceIsolationPolicy } from './policies';
import { users } from './users';
import { workspaces } from './workspaces';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const records = pgTable(
  'records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    name: text('name').notNull().default(''),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    search: tsvector('search').notNull().default(sql`''::tsvector`),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      name: 'records_object_workspace_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    unique('records_id_workspace_unique').on(table.id, table.workspaceId),
    index('records_workspace_object_idx')
      .on(table.workspaceId, table.objectId)
      .where(sql`${table.deletedAt} is null`),
    index('records_owner_idx')
      .on(table.workspaceId, table.objectId, table.ownerId)
      .where(sql`${table.deletedAt} is null`),
    index('records_name_idx')
      .on(table.workspaceId, table.objectId, table.name)
      .where(sql`${table.deletedAt} is null`),
    index('records_created_at_idx')
      .on(table.workspaceId, table.objectId, table.createdAt)
      .where(sql`${table.deletedAt} is null`),
    index('records_search_gin').using('gin', table.search),
    workspaceIsolationPolicy('records_workspace_isolation', table.workspaceId),
  ],
);

export const recordRelations = pgTable(
  'record_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id').notNull(),
    fromRecordId: uuid('from_record_id').notNull(),
    toRecordId: uuid('to_record_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'record_relations_field_workspace_fk',
      columns: [table.fieldId, table.workspaceId],
      foreignColumns: [fieldDefinitions.id, fieldDefinitions.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'record_relations_from_workspace_fk',
      columns: [table.fromRecordId, table.workspaceId],
      foreignColumns: [records.id, records.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'record_relations_to_workspace_fk',
      columns: [table.toRecordId, table.workspaceId],
      foreignColumns: [records.id, records.workspaceId],
    }).onDelete('cascade'),
    unique('record_relations_field_from_to_unique').on(
      table.fieldId,
      table.fromRecordId,
      table.toRecordId,
    ),
    index('record_relations_from_idx').on(table.workspaceId, table.fieldId, table.fromRecordId),
    index('record_relations_to_idx').on(table.workspaceId, table.fieldId, table.toRecordId),
    workspaceIsolationPolicy('record_relations_workspace_isolation', table.workspaceId),
  ],
);
