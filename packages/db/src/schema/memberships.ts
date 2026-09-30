import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { roles } from './roles';
import { users } from './users';
import { workspaces } from './workspaces';

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('memberships_workspace_user_unique').on(table.workspaceId, table.userId),
    index('memberships_workspace_id_idx').on(table.workspaceId),
    foreignKey({
      columns: [table.roleId, table.workspaceId],
      foreignColumns: [roles.id, roles.workspaceId],
      name: 'memberships_role_workspace_fk',
    }),
    pgPolicy('memberships_workspace_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'crm_app',
      using: sql`${table.workspaceId} = NULLIF(current_setting('app.workspace_id', true), '')::uuid`,
      withCheck: sql`${table.workspaceId} = NULLIF(current_setting('app.workspace_id', true), '')::uuid`,
    }),
    pgPolicy('memberships_self_select', {
      as: 'permissive',
      for: 'select',
      to: 'crm_app',
      using: sql`${table.userId} = NULLIF(current_setting('app.user_id', true), '')`,
    }),
  ],
);
