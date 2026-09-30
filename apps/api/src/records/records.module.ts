import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MetadataModule } from '../metadata/metadata.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

@Module({
  imports: [AuditModule, MetadataModule],
  controllers: [RecordsController],
  providers: [RecordsService],
})
export class RecordsModule {}
