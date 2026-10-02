import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ActivitiesModule } from './activities/activities.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AutomationsModule } from './automations/automations.module';
import { BillingModule } from './billing/billing.module';
import { AppConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { EmailModule } from './email/email.module';
import { EventsModule } from './events/events.module';
import { ExportsModule } from './exports/exports.module';
import { FilesModule } from './files/files.module';
import { GdprModule } from './gdpr/gdpr.module';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { JobsModule } from './jobs/jobs.module';
import { MembersModule } from './members/members.module';
import { MetadataModule } from './metadata/metadata.module';
import { RecordsModule } from './records/records.module';
import { RolesModule } from './roles/roles.module';
import { SearchModule } from './search/search.module';
import { SetupModule } from './setup/setup.module';
import { StorageModule } from './storage/storage.module';
import { LOG_REDACT_PATHS, LOG_SERIALIZERS } from './common/logging';
import { ENV } from './tokens';
import { ViewsModule } from './views/views.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => [
        {
          ttl: env.RATE_LIMIT_TTL_MS,
          limit: env.RATE_LIMIT_MAX,
        },
      ],
    }),
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
          redact: LOG_REDACT_PATHS,
          serializers: LOG_SERIALIZERS,
          autoLogging: env.NODE_ENV !== 'test',
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    EmailModule,
    StorageModule,
    EventsModule,
    AuditModule,
    BillingModule,
    AuthModule,
    ApiKeysModule,
    HealthModule,
    SetupModule,
    WorkspacesModule,
    InvitationsModule,
    RolesModule,
    MembersModule,
    JobsModule,
    MetadataModule,
    RecordsModule,
    GdprModule,
    ViewsModule,
    FilesModule,
    ExportsModule,
    SearchModule,
    ActivitiesModule,
    WebhooksModule,
    AutomationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
