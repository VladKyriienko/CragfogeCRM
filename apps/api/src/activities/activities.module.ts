import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MetadataModule } from '../metadata/metadata.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  imports: [AuditModule, MetadataModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
