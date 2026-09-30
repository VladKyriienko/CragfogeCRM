import { Inject, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_OBJECT_ID,
  type AcceptInvitationBody,
  type CreateInvitationBody,
} from '@cragfoge/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext, RequestUser } from '../common/request-context';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@ApiCookieAuth()
@Controller()
@UseGuards(AuthGuard)
export class InvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  @Get('invitations')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @UseGuards(WorkspaceGuard, PermissionGuard)
  @RequirePermission(ADMIN_OBJECT_ID, 'read')
  list(@WorkspaceContext() ctx: RequestContext) {
    return this.invitations.list(ctx);
  }

  @Post('invitations')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @UseGuards(WorkspaceGuard, PermissionGuard)
  @RequirePermission(ADMIN_OBJECT_ID, 'create')
  create(@WorkspaceContext() ctx: RequestContext, @Body() body: CreateInvitationBody) {
    return this.invitations.create(ctx, body);
  }

  @Post('invitations/accept')
  accept(@CurrentUser() user: RequestUser, @Body() body: AcceptInvitationBody) {
    return this.invitations.accept(user, body);
  }
}
