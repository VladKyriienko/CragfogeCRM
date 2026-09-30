import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { openDatabase, sql } from '@cragfoge/db';
import { shouldOwnQueues, shouldRunWorkers, type Env } from '../config/env';
import { ENV, REDIS } from '../tokens';

export type ExpressionIndexJob = {
  workspaceId: string;
  objectId: string;
  fieldApiName: string;
};

const QUEUE_NAME = 'metadata-expression-index';

@Injectable()
export class IndexJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexJobsService.name);
  private queue: Queue<ExpressionIndexJob> | undefined;
  private worker: Worker<ExpressionIndexJob> | undefined;
  private connection: IORedis | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') {
      return;
    }
    const ownQueue = shouldOwnQueues(this.env);
    const runWorker = shouldRunWorkers(this.env);
    if (!ownQueue && !runWorker) {
      return;
    }
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    if (ownQueue) {
      this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    }
    if (runWorker) {
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          await this.createExpressionIndex(job.data);
        },
        { connection: this.connection.duplicate() },
      );
      this.worker.on('failed', (job, error) => {
        this.logger.error(`Index job ${job?.id} failed: ${error.message}`);
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueueExpressionIndex(job: ExpressionIndexJob): Promise<void> {
    if (!this.queue) {
      // In tests / when queue disabled, run inline with migrator connection.
      await this.createExpressionIndex(job);
      return;
    }
    await this.queue.add('create-expression-index', job, {
      jobId: `${job.workspaceId}:${job.objectId}:${job.fieldApiName}`,
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

  private async createExpressionIndex(job: ExpressionIndexJob): Promise<void> {
    if (!/^[a-z][a-z0-9_]*$/.test(job.fieldApiName)) {
      throw new Error('Invalid field api name for index');
    }
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(job.workspaceId) || !uuidRe.test(job.objectId)) {
      throw new Error('Invalid workspace or object id for index');
    }
    const shortWs = job.workspaceId.replace(/-/g, '').slice(0, 8);
    const shortObj = job.objectId.replace(/-/g, '').slice(0, 8);
    const indexName = `records_data_${shortWs}_${shortObj}_${job.fieldApiName}_idx`;
    const migratorUrl =
      process.env.DATABASE_URL_MIGRATOR ??
      'postgresql://crm_migrator:crm_migrator@localhost:5432/crm';
    const handle = openDatabase(migratorUrl);
    try {
      // CONCURRENTLY cannot run inside a transaction.
      await handle.db.execute(sql.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName}
        ON records ((data->>'${job.fieldApiName}'))
        WHERE workspace_id = '${job.workspaceId}'::uuid
          AND object_id = '${job.objectId}'::uuid
          AND deleted_at IS NULL
      `));
    } finally {
      await handle.close();
    }
  }
}
