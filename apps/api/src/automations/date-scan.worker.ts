import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { shouldRunWorkers, type Env } from '../config/env';
import { ENV } from '../tokens';
import { AutomationsService } from './automations.service';

const QUEUE_NAME = 'automation-date-scan';

@Injectable()
export class DateScanWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DateScanWorker.name);
  private queue: Queue | undefined;
  private worker: Worker | undefined;
  private connection: IORedis | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(AutomationsService) private readonly automations: AutomationsService,
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
        await this.automations.scanDateReached();
      },
      { connection: this.connection.duplicate() },
    );
    this.worker.on('failed', (_job, error) => {
      this.logger.error(`Date scan failed: ${error.message}`);
    });
    await this.queue.add('daily', {}, {
      removeOnComplete: true,
      jobId: 'automation-date-scan-daily',
      repeat: { every: 24 * 60 * 60 * 1000 },
    } as Parameters<Queue['add']>[2]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }
}
