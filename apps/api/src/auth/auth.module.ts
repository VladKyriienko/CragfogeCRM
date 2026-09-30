import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { AppConfigModule } from '../config/config.module';
import type { Env } from '../config/env';
import { EmailModule } from '../email/email.module';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email.types';
import { ENV } from '../tokens';
import { createAuth } from './auth';
import { AUTH } from './auth.tokens';

@Global()
@Module({
  imports: [AppConfigModule, EmailModule, AuditModule],
  providers: [
    {
      provide: AUTH,
      inject: [ENV, EMAIL_PROVIDER, AuditService],
      useFactory: (env: Env, email: EmailProvider, audit: AuditService) =>
        createAuth(env, email, audit),
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
