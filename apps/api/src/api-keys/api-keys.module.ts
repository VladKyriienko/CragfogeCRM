import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../redis/redis.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyRateLimitService } from './api-key-rate-limit.service';

@Global()
@Module({
  imports: [AuditModule, RedisModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyRateLimitService],
  exports: [ApiKeysService, ApiKeyRateLimitService],
})
export class ApiKeysModule {}
