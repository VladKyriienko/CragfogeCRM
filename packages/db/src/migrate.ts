import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { DEFAULT_ADMIN_DATABASE_URL, DEFAULT_MIGRATOR_DATABASE_URL } from './defaults';
import { findRepoRoot, loadDotEnv } from './load-dot-env';

const ROLE_STATEMENTS = [
  "create role crm_migrator login password 'crm_migrator' nosuperuser nocreatedb nocreaterole nobypassrls",
  "create role crm_app login password 'crm_app' nosuperuser nocreatedb nocreaterole nobypassrls",
] as const;

const ROLE_ALTER_STATEMENTS = [
  "alter role crm_migrator with login password 'crm_migrator' nosuperuser nocreatedb nocreaterole nobypassrls",
  "alter role crm_app with login password 'crm_app' nosuperuser nocreatedb nocreaterole nobypassrls",
] as const;

const ADMIN_GRANT_STATEMENTS = [
  'revoke create on schema public from public',
  'grant connect on database crm to crm_migrator',
  'grant connect on database crm to crm_app',
  'grant create on database crm to crm_migrator',
  'grant usage, create on schema public to crm_migrator',
  'grant usage on schema public to crm_app',
] as const;

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'connection failed';
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://***');
}

async function connectWithRetry(url: string): Promise<Sql> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const sql = postgres(url, {
      max: 1,
      connect_timeout: 3,
      onnotice: () => undefined,
    });
    try {
      await sql`select 1`;
      return sql;
    } catch (error) {
      lastError = error;
      await sql.end({ timeout: 1 }).catch(() => undefined);
      await new Promise((resolveSleep) => {
        setTimeout(resolveSleep, 1000);
      });
    }
  }
  throw new Error(`Could not connect to Postgres: ${safeMessage(lastError)}`);
}

async function ensureRoles(admin: Sql): Promise<void> {
  const existing = await admin<{ rolname: string }[]>`
    select rolname from pg_roles where rolname in ('crm_migrator', 'crm_app')
  `;
  const names = new Set(existing.map((row) => row.rolname));

  if (!names.has('crm_migrator')) {
    await admin.unsafe(ROLE_STATEMENTS[0]);
  }
  if (!names.has('crm_app')) {
    await admin.unsafe(ROLE_STATEMENTS[1]);
  }
  for (const statement of ROLE_ALTER_STATEMENTS) {
    await admin.unsafe(statement);
  }
  for (const statement of ADMIN_GRANT_STATEMENTS) {
    await admin.unsafe(statement);
  }
}

export async function prepareDatabase(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  loadDotEnv(resolve(repoRoot, '.env'));

  const adminUrl = process.env.DATABASE_URL_ADMIN ?? DEFAULT_ADMIN_DATABASE_URL;
  const migratorUrl = process.env.DATABASE_URL_MIGRATOR ?? DEFAULT_MIGRATOR_DATABASE_URL;
  const packageRoot = resolve(repoRoot, 'packages/db');

  const admin = await connectWithRetry(adminUrl);
  try {
    await ensureRoles(admin);
  } finally {
    await admin.end({ timeout: 5 });
  }

  const migrator = await connectWithRetry(migratorUrl);
  try {
    await migrate(drizzle(migrator), {
      migrationsFolder: resolve(packageRoot, 'migrations'),
    });
    const grants = readFileSync(resolve(packageRoot, 'sql/grants.sql'), 'utf8');
    await migrator.unsafe(grants);
    const recordsSearch = readFileSync(resolve(packageRoot, 'sql/records_search.sql'), 'utf8');
    await migrator.unsafe(recordsSearch);
  } finally {
    await migrator.end({ timeout: 5 });
  }
}
