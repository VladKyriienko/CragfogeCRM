import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, prepareDatabase } from './index';
import { DEFAULT_MIGRATOR_DATABASE_URL } from './defaults';

/**
 * Structural audit of tenant isolation. It reads the live catalog, so a new table
 * with `workspace_id` and no RLS fails here without anyone remembering to add a test.
 * See also `tenant.test.ts` for behavioural cross-tenant checks.
 */

/** Tables that intentionally have no `workspace_id`. Adding a table here is a security decision. */
const NON_TENANT_TABLES: Record<string, string> = {
  workspaces: 'tenant root; access is checked in the application layer',
  users: 'Better Auth identity table; users can belong to many workspaces',
  accounts: 'Better Auth credentials, scoped by user',
  sessions: 'Better Auth sessions, scoped by user',
  verifications: 'Better Auth one-time tokens',
  two_factors: 'Better Auth TOTP secrets, scoped by user',
  instance_license: 'single-row self-host licence, not tenant data',
  stripe_webhook_events: 'Stripe event dedupe log, not tenant data',
};

/** Commands each tenant table must cover with a policy. audit_logs is append-only on purpose. */
const ALL_COMMANDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;
const REQUIRED_COMMANDS: Record<string, readonly string[]> = {
  audit_logs: ['SELECT', 'INSERT'],
};

type PolicyRow = {
  table_name: string;
  policy_name: string;
  cmd: string;
  roles: string[];
  qual: string | null;
  with_check: string | null;
};

describe('row level security audit', () => {
  let migrator: ReturnType<typeof openDatabase>;
  let tables: { table_name: string; has_workspace_id: boolean; rls_enabled: boolean }[];
  let policies: PolicyRow[];

  beforeAll(async () => {
    await prepareDatabase();
    migrator = openDatabase(process.env.DATABASE_URL_MIGRATOR ?? DEFAULT_MIGRATOR_DATABASE_URL);

    tables = await migrator.db.execute<{
      table_name: string;
      has_workspace_id: boolean;
      rls_enabled: boolean;
    }>(sql`
      select c.relname as table_name,
             exists (
               select 1 from pg_attribute a
               where a.attrelid = c.oid and a.attname = 'workspace_id' and not a.attisdropped
             ) as has_workspace_id,
             c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and c.relname not like '\_\_drizzle%'
      order by c.relname
    `);

    policies = await migrator.db.execute<PolicyRow>(sql`
      select tablename as table_name, policyname as policy_name, cmd,
             roles::text[] as roles, qual, with_check
      from pg_policies
      where schemaname = 'public'
    `);
  });

  afterAll(async () => {
    await migrator.close();
  });

  it('has an explicit decision for every table without workspace_id', () => {
    const undeclared = tables
      .filter((t) => !t.has_workspace_id && !(t.table_name in NON_TENANT_TABLES))
      .map((t) => t.table_name);
    expect(
      undeclared,
      'These tables have no workspace_id. Add workspace_id + RLS, or list them in NON_TENANT_TABLES with a reason.',
    ).toEqual([]);
  });

  it('keeps the non-tenant allow-list free of stale entries', () => {
    const existing = new Set(tables.map((t) => t.table_name));
    const stale = Object.keys(NON_TENANT_TABLES).filter((name) => !existing.has(name));
    expect(stale).toEqual([]);
  });

  it('enables row level security on every table with workspace_id', () => {
    const missing = tables
      .filter((t) => t.has_workspace_id && !t.rls_enabled)
      .map((t) => t.table_name);
    expect(missing).toEqual([]);
  });

  it('covers every required command with a policy on every tenant table', () => {
    const gaps: string[] = [];
    for (const table of tables.filter((t) => t.has_workspace_id)) {
      const required = REQUIRED_COMMANDS[table.table_name] ?? ALL_COMMANDS;
      const mine = policies.filter((p) => p.table_name === table.table_name);
      for (const command of required) {
        const covered = mine.some((p) => p.cmd === command || p.cmd === 'ALL');
        if (!covered) gaps.push(`${table.table_name}: no ${command} policy`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('scopes every write policy to app.workspace_id', () => {
    const offenders: string[] = [];
    const tenantTables = new Set(tables.filter((t) => t.has_workspace_id).map((t) => t.table_name));
    for (const policy of policies.filter((p) => tenantTables.has(p.table_name))) {
      if (policy.cmd === 'SELECT') continue;
      const text = `${policy.qual ?? ''} ${policy.with_check ?? ''}`;
      if (!text.includes('app.workspace_id')) {
        offenders.push(`${policy.table_name}.${policy.policy_name} (${policy.cmd})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never leaves a tenant table readable without a tenant or membership condition', () => {
    const offenders: string[] = [];
    const tenantTables = new Set(tables.filter((t) => t.has_workspace_id).map((t) => t.table_name));
    for (const policy of policies.filter((p) => tenantTables.has(p.table_name))) {
      const using = (policy.qual ?? '').replace(/\s+/g, '').toLowerCase();
      if (using === '' && policy.cmd !== 'INSERT') {
        offenders.push(`${policy.table_name}.${policy.policy_name}: empty USING`);
      }
      if (using === 'true') {
        offenders.push(`${policy.table_name}.${policy.policy_name}: USING (true)`);
      }
      if (policy.with_check?.replace(/\s+/g, '').toLowerCase() === 'true') {
        offenders.push(`${policy.table_name}.${policy.policy_name}: WITH CHECK (true)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('applies tenant policies to crm_app only', () => {
    const tenantTables = new Set(tables.filter((t) => t.has_workspace_id).map((t) => t.table_name));
    const offenders = policies
      .filter((p) => tenantTables.has(p.table_name))
      .filter((p) => !(p.roles.length === 1 && p.roles[0] === 'crm_app'))
      .map((p) => `${p.table_name}.${p.policy_name}: ${p.roles.join(',')}`);
    expect(offenders).toEqual([]);
  });

  it('keeps the runtime role unprivileged and away from table ownership', async () => {
    const [role] = await migrator.db.execute<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }>(sql`select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
           from pg_roles where rolname = 'crm_app'`);
    expect(role).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });

    const owned = await migrator.db.execute<{ relname: string }>(sql`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles r on r.oid = c.relowner
      where n.nspname = 'public' and r.rolname = 'crm_app'
    `);
    expect(owned.map((row) => row.relname)).toEqual([]);
  });
});
