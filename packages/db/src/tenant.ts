import { sql } from 'drizzle-orm';
import { workspaceIdSchema } from '@cragfoge/shared';
import { getAppDb, type TenantTransaction } from './client';

export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
  options?: { userId?: string },
): Promise<T> {
  const id = workspaceIdSchema.parse(workspaceId);
  const db = getAppDb();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${id}, true)`);
    if (options?.userId) {
      await tx.execute(sql`select set_config('app.user_id', ${options.userId}, true)`);
    }
    return fn(tx);
  });
}

export async function withUser<T>(
  userId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const db = getAppDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
