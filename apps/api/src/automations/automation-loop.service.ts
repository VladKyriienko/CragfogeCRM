import { Inject, Injectable } from '@nestjs/common';
import type IORedis from 'ioredis';
import type { Env } from '../config/env';
import { ENV, REDIS } from '../tokens';

const LOOP_LIMIT = 5;
const LOOP_TTL_SECONDS = 60;

@Injectable()
export class AutomationLoopService {
  constructor(
    @Inject(REDIS) private readonly redis: IORedis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Returns false when the automation has exceeded N runs for this record in the last minute. */
  async tryAcquire(workspaceId: string, automationId: string, recordId: string): Promise<boolean> {
    if (this.env.NODE_ENV === 'test') {
      // In-memory counter for tests.
      const key = `${workspaceId}:${automationId}:${recordId}`;
      const current = (AutomationLoopService.testCounters.get(key) ?? 0) + 1;
      AutomationLoopService.testCounters.set(key, current);
      return current <= LOOP_LIMIT;
    }

    const key = `auto:${workspaceId}:${automationId}:${recordId}`;
    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect().catch(() => undefined);
      }
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, LOOP_TTL_SECONDS);
      }
      return count <= LOOP_LIMIT;
    } catch {
      return true;
    }
  }

  private static readonly testCounters = new Map<string, number>();

  /** Test helper. */
  static resetTestCounters(): void {
    AutomationLoopService.testCounters.clear();
  }
}
