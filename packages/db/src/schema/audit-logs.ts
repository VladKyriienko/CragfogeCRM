import { sql } from 'drizzle-orm';
import { index, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { workspaces } from './workspaces';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    diff: jsonb('diff').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_workspace_id_idx').on(table.workspaceId),
    index('audit_logs_created_at_idx').on(table.createdAt),
    pgPolicy('audit_logs_workspace_select', {
      as: 'permissive',
      for: 'select',
      to: 'crm_app',
      using: sql`${table.workspaceId} = NULLIF(current_setting('app.workspace_id', true), '')::uuid`,
    }),
    pgPolicy('audit_logs_workspace_write', {
      as: 'permissive',
      for: 'insert',
      to: 'crm_app',
      withCheck: sql`(
        ${table.workspaceId} = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        or (
          ${table.workspaceId} is null
          and nullif(current_setting('app.workspace_id', true), '') is null
        )
      )`,
    }),
  ],
);
