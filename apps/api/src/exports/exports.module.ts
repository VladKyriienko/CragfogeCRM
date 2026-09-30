import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { JobsModule } from '../jobs/jobs.module';
import { MetadataModule } from '../metadata/metadata.module';
import { StorageModule } from '../storage/storage.module';
import { ExportWorkerService } from './export-worker.service';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [AuditModule, JobsModule, MetadataModule, StorageModule],
  controllers: [ExportsController],
  providers: [ExportsService, ExportWorkerService],
})
export class ExportsModule {}
