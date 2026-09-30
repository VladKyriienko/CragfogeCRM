import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  and,
  eq,
  exportJobs,
  files,
  isNotNull,
  lte,
  openDatabase,
  sql,
  withWorkspace,
  workspaces,
  type AppDatabase,
} from '@cragfoge/db';
import { shouldRunWorkers, type Env } from '../config/env';
import type { StorageProvider } from '../storage/storage.types';
import { APP_DB, ENV, STORAGE } from '../tokens';

const QUEUE_NAME = 'workspace-purge';

@Injectable()
export class WorkspacePurgeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkspacePurgeWorker.name);
  private queue: Queue | undefined;
  private worker: Worker | undefined;
  private connection: IORedis | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.NODE_ENV === 'test' || !shouldRunWorkers(this.env)) {
      return;
    }
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async () => {
        await this.purgeDueWorkspaces();
      },
      { connection: this.connection.duplicate() },
    );
    this.worker.on('failed', (_job, error) => {
      this.logger.error(`Workspace purge failed: ${error.message}`);
    });
    await this.queue.add(
      'daily',
      {},
      {
        removeOnComplete: true,
        jobId: 'workspace-purge-daily',
        repeat: { every: 24 * 60 * 60 * 1000 },
      } as Parameters<Queue['add']>[2],
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  /** Exposed for tests. */
  async purgeDueWorkspaces(): Promise<number> {
    const due = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(isNotNull(workspaces.deletionScheduledAt), lte(workspaces.deletionScheduledAt, new Date())),
      );

    for (const workspace of due) {
      await this.hardDeleteWorkspace(workspace.id);
    }
    return due.length;
  }

  private async hardDeleteWorkspace(workspaceId: string): Promise<void> {
    this.logger.warn(`Hard-deleting workspace ${workspaceId}`);
    const { fileRows, exportRows } = await withWorkspace(workspaceId, async (tx) => {
      const fileList = await tx
        .select({ storageKey: files.storageKey })
        .from(files)
        .where(eq(files.workspaceId, workspaceId));
      const exportList = await tx
        .select({ downloadPath: exportJobs.downloadPath })
        .from(exportJobs)
        .where(eq(exportJobs.workspaceId, workspaceId));
      return { fileRows: fileList, exportRows: exportList };
    });

    for (const file of fileRows) {
      await this.storage.deleteObject(file.storageKey).catch(() => undefined);
    }
    for (const job of exportRows) {
      if (job.downloadPath) {
        await this.storage.deleteObject(job.downloadPath).catch(() => undefined);
      }
    }

    // workspaces has no RLS; cascade removes tenant rows.
    await this.db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    const migratorUrl =
      process.env.DATABASE_URL_MIGRATOR ??
      'postgresql://crm_migrator:crm_migrator@localhost:5432/crm';
    const handle = openDatabase(migratorUrl);
    try {
      await handle.db.execute(sql`
        update audit_logs
        set diff = jsonb_build_object('redacted', true, 'reason', 'workspace_purge')
        where workspace_id is null
          and entity_type = 'workspace'
          and entity_id = ${workspaceId}
      `);
    } finally {
      await handle.close();
    }
  }
}
