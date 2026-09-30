import {
  Inject,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type {
  BulkDeleteBody,
  BulkUpdateBody,
  CreateRecordBody,
  UpdateRecordBody,
} from '@cragfoge/shared';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { RecordsService } from './records.service';

@ApiTags('records')
@ApiCookieAuth()
@ApiBearerAuth('api-key')
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('objects/:apiName/records')
@UseGuards(AuthGuard, WorkspaceGuard)
export class RecordsController {
  constructor(@Inject(RecordsService) private readonly records: RecordsService) {}

  @Get()
  list(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.records.list(ctx, apiName, query);
  }

  @Post()
  create(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Body() body: CreateRecordBody,
  ) {
    return this.records.create(ctx, apiName, body);
  }

  @Post('bulk-delete')
  bulkDelete(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Body() body: BulkDeleteBody,
  ) {
    return this.records.bulkDelete(ctx, apiName, body);
  }

  @Post('bulk-update')
  bulkUpdate(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Body() body: BulkUpdateBody,
  ) {
    return this.records.bulkUpdate(ctx, apiName, body);
  }

  @Get(':id')
  get(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('id') id: string,
  ) {
    return this.records.get(ctx, apiName, id);
  }

  @Patch(':id')
  update(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('id') id: string,
    @Body() body: UpdateRecordBody,
  ) {
    return this.records.update(ctx, apiName, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('id') id: string,
  ) {
    await this.records.remove(ctx, apiName, id);
  }
}
