import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ADMIN_OBJECT_ID, type CreateApiKeyBody } from '@cragfoge/shared';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { ApiKeysService } from './api-keys.service';

@ApiTags('api-keys')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('api-keys')
@UseGuards(AuthGuard, WorkspaceGuard, PermissionGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermission(ADMIN_OBJECT_ID, 'read')
  list(@WorkspaceContext() ctx: RequestContext) {
    return this.apiKeys.list(ctx);
  }

  @Post()
  @RequirePermission(ADMIN_OBJECT_ID, 'create')
  create(@WorkspaceContext() ctx: RequestContext, @Body() body: CreateApiKeyBody) {
    return this.apiKeys.create(ctx, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(ADMIN_OBJECT_ID, 'delete')
  async revoke(@WorkspaceContext() ctx: RequestContext, @Param('id') id: string) {
    await this.apiKeys.revoke(ctx, id);
  }
}
