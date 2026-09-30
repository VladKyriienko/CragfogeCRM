import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const systemRoleKeys = ['owner', 'admin', 'member'] as const;
export type SystemRoleKey = (typeof systemRoleKeys)[number];

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('roles_workspace_name_unique').on(table.workspaceId, table.name),
    unique('roles_workspace_key_unique').on(table.workspaceId, table.key),
    unique('roles_id_workspace_unique').on(table.id, table.workspaceId),
    index('roles_workspace_id_idx').on(table.workspaceId),
    pgPolicy('roles_workspace_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'crm_app',
      using: sql`${table.workspaceId} = NULLIF(current_setting('app.workspace_id', true), '')::uuid`,
      withCheck: sql`${table.workspaceId} = NULLIF(current_setting('app.workspace_id', true), '')::uuid`,
    }),
    pgPolicy('roles_member_select', {
      as: 'permissive',
      for: 'select',
      to: 'crm_app',
      using: sql`exists (
        select 1
        from memberships m
        where m.workspace_id = ${table.workspaceId}
          and m.user_id = nullif(current_setting('app.user_id', true), '')
      )`,
    }),
  ],
);
