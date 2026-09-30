import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_OBJECT_ID,
  type CreateRoleBody,
  type UpdateMemberRoleBody,
} from '@cragfoge/shared';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller()
@UseGuards(AuthGuard, WorkspaceGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermission(ADMIN_OBJECT_ID, 'read')
  listRoles(@WorkspaceContext() ctx: RequestContext) {
    return this.roles.listRoles(ctx);
  }

  @Post('roles')
  @RequirePermission(ADMIN_OBJECT_ID, 'create')
  createRole(@WorkspaceContext() ctx: RequestContext, @Body() body: CreateRoleBody) {
    return this.roles.createRole(ctx, body);
  }

  @Get('members')
  @RequirePermission(ADMIN_OBJECT_ID, 'read')
  listMembers(@WorkspaceContext() ctx: RequestContext) {
    return this.roles.listMembers(ctx);
  }

  @Patch('members/:membershipId/role')
  @RequirePermission(ADMIN_OBJECT_ID, 'update')
  updateMemberRole(
    @WorkspaceContext() ctx: RequestContext,
    @Param('membershipId') membershipId: string,
    @Body() body: UpdateMemberRoleBody,
  ) {
    return this.roles.updateMemberRole(ctx, membershipId, body);
  }

  @Delete('members/:membershipId')
  @RequirePermission(ADMIN_OBJECT_ID, 'delete')
  removeMember(
    @WorkspaceContext() ctx: RequestContext,
    @Param('membershipId') membershipId: string,
  ) {
    return this.roles.removeMember(ctx, membershipId);
  }
}
