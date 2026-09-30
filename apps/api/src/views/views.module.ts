import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MetadataModule } from '../metadata/metadata.module';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';

@Module({
  imports: [AuditModule, MetadataModule],
  controllers: [ViewsController],
  providers: [ViewsService],
})
export class ViewsModule {}
