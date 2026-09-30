import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DomainEventsService } from '../events/domain-events.service';
import { RedisModule } from '../redis/redis.module';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuditModule, RedisModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryWorker],
  exports: [WebhooksService, WebhookDeliveryWorker],
})
export class WebhooksModule implements OnModuleInit {
  constructor(
    private readonly domainEvents: DomainEventsService,
    private readonly webhooks: WebhooksService,
  ) {}

  onModuleInit(): void {
    this.domainEvents.on(async (event) => {
      await this.webhooks.enqueueForEvent(event);
    });
  }
}
