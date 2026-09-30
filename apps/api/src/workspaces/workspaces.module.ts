import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { OnboardingService } from './onboarding.service';
import { WorkspacePurgeWorker } from './workspace-purge.worker';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, OnboardingService, WorkspacePurgeWorker],
  exports: [WorkspacesService, WorkspacePurgeWorker],
})
export class WorkspacesModule {}
