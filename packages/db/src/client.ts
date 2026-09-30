import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DEFAULT_APP_DATABASE_URL } from './defaults';
import * as schema from './schema';

export type AppDatabase = PostgresJsDatabase<typeof schema>;
export type TenantTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

type DatabaseHandle = {
  db: AppDatabase;
  close: () => Promise<void>;
};

function connect(connectionString: string, max: number): DatabaseHandle {
  const client = postgres(connectionString, {
    max,
    connect_timeout: 10,
    idle_timeout: 20,
    onnotice: () => undefined,
  });

  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

export function openDatabase(connectionString: string): DatabaseHandle {
  return connect(connectionString, 5);
}

let appDatabase: DatabaseHandle | undefined;

export function getAppDb(
  connectionString = process.env.DATABASE_URL ?? DEFAULT_APP_DATABASE_URL,
): AppDatabase {
  if (!appDatabase) {
    appDatabase = connect(connectionString, 10);
  }
  return appDatabase.db;
}

export async function pingDatabase(db: AppDatabase): Promise<void> {
  await db.execute(sql`select 1`);
}

export async function closeAppDb(): Promise<void> {
  if (!appDatabase) {
    return;
  }
  const current = appDatabase;
  appDatabase = undefined;
  await current.close();
}
