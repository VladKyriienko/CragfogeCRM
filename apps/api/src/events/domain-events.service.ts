import { Injectable, Logger } from '@nestjs/common';
import type { DomainEvent, DomainEventListener } from './domain-events';

@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);
  private readonly listeners: DomainEventListener[] = [];

  on(listener: DomainEventListener): void {
    this.listeners.push(listener);
  }

  async emit(event: DomainEvent): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        this.logger.error(`Domain event listener failed for ${event.type}: ${message}`);
      }
    }
  }
}
