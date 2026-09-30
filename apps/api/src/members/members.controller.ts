import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { MembersService } from './members.service';

/**
 * Lightweight member picker available to any workspace member (unlike
 * `/members`, which is admin-only and includes role assignments).
 */
@ApiTags('members')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('workspace')
@UseGuards(AuthGuard, WorkspaceGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  list(@WorkspaceContext() ctx: RequestContext) {
    return this.members.listPicker(ctx);
  }
}
