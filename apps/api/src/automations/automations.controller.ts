import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_OBJECT_ID,
  type CreateAutomationBody,
  type UpdateAutomationBody,
} from '@cragfoge/shared';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { AutomationsService } from './automations.service';

@ApiTags('automations')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('automations')
@UseGuards(AuthGuard, WorkspaceGuard, PermissionGuard)
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  @RequirePermission(ADMIN_OBJECT_ID, 'read')
  list(@WorkspaceContext() ctx: RequestContext) {
    return this.automations.list(ctx);
  }

  @Post()
  @RequirePermission(ADMIN_OBJECT_ID, 'create')
  create(@WorkspaceContext() ctx: RequestContext, @Body() body: CreateAutomationBody) {
    return this.automations.create(ctx, body);
  }

  @Patch(':id')
  @RequirePermission(ADMIN_OBJECT_ID, 'update')
  update(
    @WorkspaceContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: UpdateAutomationBody,
  ) {
    return this.automations.update(ctx, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(ADMIN_OBJECT_ID, 'delete')
  async remove(@WorkspaceContext() ctx: RequestContext, @Param('id') id: string) {
    await this.automations.remove(ctx, id);
  }

  @Get(':id/runs')
  @RequirePermission(ADMIN_OBJECT_ID, 'read')
  listRuns(@WorkspaceContext() ctx: RequestContext, @Param('id') id: string) {
    return this.automations.listRuns(ctx, id);
  }
}
