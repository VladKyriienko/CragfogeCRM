import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { AuditModule } from '../audit/audit.module';
import { DomainEventsService } from '../events/domain-events.service';
import { RedisModule } from '../redis/redis.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AutomationLoopService } from './automation-loop.service';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';
import { DateScanWorker } from './date-scan.worker';

@Module({
  imports: [AuditModule, ActivitiesModule, WebhooksModule, RedisModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationLoopService, DateScanWorker],
  exports: [AutomationsService],
})
export class AutomationsModule implements OnModuleInit {
  constructor(
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
    private readonly automations: AutomationsService,
  ) {}

  onModuleInit(): void {
    this.domainEvents.on(async (event) => {
      await this.automations.handleDomainEvent(event);
    });
  }
}
