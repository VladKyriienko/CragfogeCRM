import { sql } from 'drizzle-orm';
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaceIsolationPolicy } from './policies';
import { workspaces } from './workspaces';

export const objectDefinitions = pgTable(
  'object_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    apiName: text('api_name').notNull(),
    labelSingular: text('label_singular').notNull(),
    labelPlural: text('label_plural').notNull(),
    icon: text('icon'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('object_definitions_workspace_api_name_unique').on(table.workspaceId, table.apiName),
    unique('object_definitions_id_workspace_unique').on(table.id, table.workspaceId),
    index('object_definitions_workspace_id_idx').on(table.workspaceId),
    workspaceIsolationPolicy('object_definitions_workspace_isolation', table.workspaceId),
  ],
);

export const fieldTypeValues = [
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'datetime',
  'boolean',
  'select',
  'multi_select',
  'email',
  'phone',
  'url',
  'user',
  'relation',
] as const;
export type FieldType = (typeof fieldTypeValues)[number];

export const fieldDefinitions = pgTable(
  'field_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    apiName: text('api_name').notNull(),
    label: text('label').notNull(),
    type: text('type').notNull().$type<FieldType>(),
    required: boolean('required').notNull().default(false),
    isUnique: boolean('is_unique').notNull().default(false),
    isSystem: boolean('is_system').notNull().default(false),
    options: jsonb('options').$type<Record<string, unknown>>().notNull().default({}),
    position: integer('position').notNull().default(0),
    isIndexed: boolean('is_indexed').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'field_definitions_object_workspace_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    // Soft-deleted fields keep their row; uniqueness only applies to active fields
    // so an api_name can be reused after delete.
    uniqueIndex('field_definitions_object_api_name_active_unique')
      .on(table.objectId, table.apiName)
      .where(sql`${table.deletedAt} is null`),
    unique('field_definitions_id_workspace_unique').on(table.id, table.workspaceId),
    index('field_definitions_workspace_id_idx').on(table.workspaceId),
    index('field_definitions_object_id_idx').on(table.objectId),
    workspaceIsolationPolicy('field_definitions_workspace_isolation', table.workspaceId),
  ],
);
