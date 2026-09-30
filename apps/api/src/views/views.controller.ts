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
import type { CreateViewBody, UpdateViewBody } from '@cragfoge/shared';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { ViewsService } from './views.service';

@ApiTags('views')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('objects/:apiName/views')
@UseGuards(AuthGuard, WorkspaceGuard)
export class ViewsController {
  constructor(private readonly views: ViewsService) {}

  @Get()
  list(@WorkspaceContext() ctx: RequestContext, @Param('apiName') apiName: string) {
    return this.views.list(ctx, apiName);
  }

  @Post()
  create(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Body() body: CreateViewBody,
  ) {
    return this.views.create(ctx, apiName, body);
  }

  @Patch(':viewId')
  update(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('viewId') viewId: string,
    @Body() body: UpdateViewBody,
  ) {
    return this.views.update(ctx, apiName, viewId, body);
  }

  @Delete(':viewId')
  @HttpCode(204)
  async remove(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('viewId') viewId: string,
  ) {
    await this.views.remove(ctx, apiName, viewId);
  }
}
