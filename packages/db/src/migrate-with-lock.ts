import postgres from 'postgres';
import { DEFAULT_ADMIN_DATABASE_URL } from './defaults';
import { prepareDatabase } from './migrate';

/** Fixed advisory-lock key so concurrent API containers serialize migrations. */
const MIGRATION_LOCK_KEY = 874_210_938;

/**
 * Runs {@link prepareDatabase} while holding a Postgres session-level advisory lock.
 * Safe when multiple API replicas start together.
 */
export async function migrateWithLock(): Promise<void> {
  const adminUrl = process.env.DATABASE_URL_ADMIN ?? DEFAULT_ADMIN_DATABASE_URL;
  const lockSql = postgres(adminUrl, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
  try {
    await lockSql`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      await prepareDatabase();
    } finally {
      await lockSql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    await lockSql.end({ timeout: 5 });
  }
}
