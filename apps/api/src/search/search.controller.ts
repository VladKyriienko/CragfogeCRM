import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('search')
@UseGuards(AuthGuard, WorkspaceGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@WorkspaceContext() ctx: RequestContext, @Query() query: Record<string, unknown>) {
    return this.searchService.search(ctx, query);
  }
}
