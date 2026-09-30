import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import { closeAppDb, getAppDb, type AppDatabase } from '@cragfoge/db';
import { AppConfigModule } from '../config/config.module';
import type { Env } from '../config/env';
import { APP_DB, ENV } from '../tokens';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: APP_DB,
      inject: [ENV],
      useFactory: (env: Env): AppDatabase => getAppDb(env.DATABASE_URL),
    },
  ],
  exports: [APP_DB],
})
export class DatabaseModule implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await closeAppDb();
  }
}
