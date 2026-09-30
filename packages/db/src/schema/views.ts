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
import { users } from './users';
import { workspaces } from './workspaces';

export const views = pgTable(
  'views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    name: text('name').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown> | null>(),
    sort: jsonb('sort').$type<Record<string, unknown> | null>(),
    columns: jsonb('columns').$type<string[]>().notNull().default([]),
    isShared: boolean('is_shared').notNull().default(false),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'views_object_workspace_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    unique('views_id_workspace_unique').on(table.id, table.workspaceId),
    index('views_workspace_object_idx').on(table.workspaceId, table.objectId),
    index('views_owner_idx').on(table.workspaceId, table.objectId, table.ownerId),
    workspaceIsolationPolicy('views_workspace_isolation', table.workspaceId),
  ],
);
