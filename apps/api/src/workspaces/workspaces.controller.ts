import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  createWorkspaceBodySchema,
  type CreateWorkspaceBody,
  type PatchOnboardingBody,
} from '@cragfoge/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import type { RequestUser } from '../common/request-context';
import { OnboardingService } from './onboarding.service';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@ApiCookieAuth()
@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(
    @Inject(WorkspacesService) private readonly workspaces: WorkspacesService,
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.workspaces.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() body: CreateWorkspaceBody) {
    return this.workspaces.create(user, createWorkspaceBodySchema.parse(body));
  }

  @Get('templates')
  listTemplates() {
    return this.onboarding.listTemplates();
  }

  @Get(':workspaceId')
  @ApiHeader({ name: 'X-Workspace-Id', required: false })
  get(@CurrentUser() user: RequestUser, @Param('workspaceId') workspaceId: string) {
    return this.workspaces.getForUser(user.id, workspaceId);
  }

  @Get(':workspaceId/onboarding')
  getOnboarding(@CurrentUser() user: RequestUser, @Param('workspaceId') workspaceId: string) {
    return this.onboarding.getChecklist(user.id, workspaceId);
  }

  @Patch(':workspaceId/onboarding')
  patchOnboarding(
    @CurrentUser() user: RequestUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: PatchOnboardingBody,
  ) {
    return this.onboarding.patchChecklist(user.id, workspaceId, body);
  }

  @Post(':workspaceId/delete')
  scheduleDelete(@CurrentUser() user: RequestUser, @Param('workspaceId') workspaceId: string) {
    return this.workspaces.scheduleDeletion(user.id, workspaceId);
  }

  @Post(':workspaceId/cancel-deletion')
  cancelDelete(@CurrentUser() user: RequestUser, @Param('workspaceId') workspaceId: string) {
    return this.workspaces.cancelDeletion(user.id, workspaceId);
  }
}
