import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import type { Env } from '../config/env';
import { ENV } from '../tokens';
import { EMAIL_PROVIDER } from './email.types';
import { NoopEmailProvider } from './noop-email.provider';
import { SmtpEmailProvider } from './smtp-email.provider';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.NODE_ENV === 'test' ? new NoopEmailProvider() : new SmtpEmailProvider(env),
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
