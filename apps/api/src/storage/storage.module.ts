import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import type { Env } from '../config/env';
import { ENV, STORAGE } from '../tokens';
import { MemoryStorageProvider } from './memory-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: STORAGE,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.NODE_ENV === 'test' ? new MemoryStorageProvider() : new S3StorageProvider(env),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
