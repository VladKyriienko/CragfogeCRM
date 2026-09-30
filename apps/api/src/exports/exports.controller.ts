import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { CreateExportJobBody } from '@cragfoge/shared';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('objects/:apiName/exports')
@UseGuards(AuthGuard, WorkspaceGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  create(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Body() body: CreateExportJobBody,
  ) {
    return this.exports.create(ctx, apiName, body);
  }

  @Get(':jobId')
  get(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('jobId') jobId: string,
  ) {
    return this.exports.get(ctx, apiName, jobId);
  }

  @Get(':jobId/download')
  async download(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('jobId') jobId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.exports.download(ctx, apiName, jobId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
