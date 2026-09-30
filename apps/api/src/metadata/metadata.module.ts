import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { MetadataCacheService } from './metadata-cache.service';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';

@Module({
  imports: [AuditModule, JobsModule],
  controllers: [MetadataController],
  providers: [MetadataService, MetadataCacheService],
  exports: [MetadataCacheService],
})
export class MetadataModule {}
