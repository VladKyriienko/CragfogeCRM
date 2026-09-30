import {
  Inject,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { UploadFileBody } from '@cragfoge/shared';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('objects/:apiName/records/:recordId/files')
@UseGuards(AuthGuard, WorkspaceGuard)
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}

  @Get()
  list(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('recordId') recordId: string,
  ) {
    return this.files.list(ctx, apiName, recordId);
  }

  @Post()
  upload(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('recordId') recordId: string,
    @Body() body: UploadFileBody,
  ) {
    return this.files.upload(ctx, apiName, recordId, body);
  }

  @Delete(':fileId')
  @HttpCode(204)
  async remove(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('recordId') recordId: string,
    @Param('fileId') fileId: string,
  ) {
    await this.files.remove(ctx, apiName, recordId, fileId);
  }
}
