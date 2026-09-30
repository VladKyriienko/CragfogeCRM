import { sql } from 'drizzle-orm';
import { pgPolicy, type AnyPgColumn } from 'drizzle-orm/pg-core';

function workspaceMatch(workspaceId: AnyPgColumn) {
  return sql`${workspaceId} = NULLIF(current_setting('app.workspace_id', true), '')::uuid`;
}

/**
 * RLS for crm_app. The table owner (crm_migrator) bypasses RLS, which is how
 * migrations write rows. The API role has NOBYPASSRLS, so this policy applies.
 */
export function workspaceIsolationPolicy(name: string, workspaceId: AnyPgColumn) {
  return pgPolicy(name, {
    as: 'permissive',
    for: 'all',
    to: 'crm_app',
    using: workspaceMatch(workspaceId),
    withCheck: workspaceMatch(workspaceId),
  });
}
