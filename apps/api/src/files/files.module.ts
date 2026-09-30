import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MetadataModule } from '../metadata/metadata.module';
import { StorageModule } from '../storage/storage.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AuditModule, MetadataModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
