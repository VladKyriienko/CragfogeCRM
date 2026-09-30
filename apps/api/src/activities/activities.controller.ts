import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { CreateActivityBody, UpdateActivityBody } from '@cragfoge/shared';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { ActivitiesService } from './activities.service';

@ApiTags('activities')
@ApiCookieAuth()
@ApiBearerAuth('api-key')
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('objects/:apiName/records/:recordId/activities')
@UseGuards(AuthGuard, WorkspaceGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('recordId') recordId: string,
  ) {
    return this.activities.list(ctx, apiName, recordId);
  }

  @Post()
  create(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('recordId') recordId: string,
    @Body() body: CreateActivityBody,
  ) {
    return this.activities.create(ctx, apiName, recordId, body);
  }

  @Patch(':activityId')
  update(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('recordId') recordId: string,
    @Param('activityId') activityId: string,
    @Body() body: UpdateActivityBody,
  ) {
    return this.activities.update(ctx, apiName, recordId, activityId, body);
  }
}
