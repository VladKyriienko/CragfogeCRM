import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { GdprService } from './gdpr.service';

@ApiTags('gdpr')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('objects/people/records')
@UseGuards(AuthGuard, WorkspaceGuard)
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Post(':id/gdpr-export')
  exportPerson(@WorkspaceContext() ctx: RequestContext, @Param('id') id: string) {
    return this.gdpr.exportPerson(ctx, id);
  }

  @Post(':id/gdpr-erase')
  erasePerson(@WorkspaceContext() ctx: RequestContext, @Param('id') id: string) {
    return this.gdpr.erasePerson(ctx, id);
  }
}
