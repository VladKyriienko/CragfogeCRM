import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import IORedis from 'ioredis';
import type { Env } from '../config/env';
import { ENV, REDIS } from '../tokens';

@Injectable()
export class ApiKeyRateLimitService {
  constructor(
    @Inject(REDIS) private readonly redis: IORedis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async assertWithinLimit(apiKeyId: string): Promise<void> {
    if (this.env.NODE_ENV === 'test') {
      return;
    }

    const key = `api_key_rl:${apiKeyId}`;
    const ttlMs = this.env.API_KEY_RATE_LIMIT_TTL_MS;
    const max = this.env.API_KEY_RATE_LIMIT_MAX;

    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect().catch(() => undefined);
      }
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.pexpire(key, ttlMs);
      }
      if (count > max) {
        throw new HttpException('API key rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Redis unavailable: fail open for availability; IP throttler still applies.
    }
  }
}
