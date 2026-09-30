import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { RedisModule } from '../redis/redis.module';
import { IndexJobsService } from './index-jobs.service';

@Global()
@Module({
  imports: [AppConfigModule, RedisModule],
  providers: [IndexJobsService],
  exports: [IndexJobsService],
})
export class JobsModule {}
