import { Inject, Injectable } from '@nestjs/common';
import { pingDatabase, type AppDatabase } from '@cragfoge/db';
import { healthResponseSchema, type HealthResponse } from '@cragfoge/shared';
import Redis from 'ioredis';
import type { Env } from '../config/env';
import { APP_DB, ENV } from '../tokens';

@Injectable()
export class HealthService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    return healthResponseSchema.parse({
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'error',
      checks: { database, redis },
    });
  }

  private async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await pingDatabase(this.db);
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkRedis(): Promise<'ok' | 'error'> {
    const client = new Redis(this.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
      retryStrategy: () => null,
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      const pong = await client.ping();
      return pong === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    } finally {
      client.disconnect();
    }
  }
}
