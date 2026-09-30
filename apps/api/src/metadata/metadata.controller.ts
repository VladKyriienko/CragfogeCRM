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
import { ApiBearerAuth, ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  ADMIN_OBJECT_ID,
  type CreateFieldBody,
  type CreateObjectBody,
  type UpdateFieldBody,
  type UpdateObjectBody,
} from '@cragfoge/shared';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { MetadataService } from './metadata.service';

@ApiTags('metadata')
@ApiCookieAuth()
@ApiBearerAuth('api-key')
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('objects')
@UseGuards(AuthGuard, WorkspaceGuard, PermissionGuard)
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get()
  listObjects(@WorkspaceContext() ctx: RequestContext) {
    return this.metadata.listObjects(ctx);
  }

  @Post()
  @RequirePermission(ADMIN_OBJECT_ID, 'create')
  createObject(@WorkspaceContext() ctx: RequestContext, @Body() body: CreateObjectBody) {
    return this.metadata.createObject(ctx, body);
  }

  @Get(':apiName')
  getObject(@WorkspaceContext() ctx: RequestContext, @Param('apiName') apiName: string) {
    return this.metadata.getObject(ctx, apiName);
  }

  @Patch(':apiName')
  @RequirePermission(ADMIN_OBJECT_ID, 'update')
  updateObject(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Body() body: UpdateObjectBody,
  ) {
    return this.metadata.updateObject(ctx, apiName, body);
  }

  @Delete(':apiName')
  @HttpCode(204)
  @RequirePermission(ADMIN_OBJECT_ID, 'delete')
  async deleteObject(@WorkspaceContext() ctx: RequestContext, @Param('apiName') apiName: string) {
    await this.metadata.deleteObject(ctx, apiName);
  }

  @Get(':apiName/fields')
  listFields(@WorkspaceContext() ctx: RequestContext, @Param('apiName') apiName: string) {
    return this.metadata.listFields(ctx, apiName);
  }

  @Post(':apiName/fields')
  @RequirePermission(ADMIN_OBJECT_ID, 'create')
  createField(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Body() body: CreateFieldBody,
  ) {
    return this.metadata.createField(ctx, apiName, body);
  }

  @Patch(':apiName/fields/:fieldApiName')
  @RequirePermission(ADMIN_OBJECT_ID, 'update')
  updateField(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('fieldApiName') fieldApiName: string,
    @Body() body: UpdateFieldBody,
  ) {
    return this.metadata.updateField(ctx, apiName, fieldApiName, body);
  }

  @Delete(':apiName/fields/:fieldApiName')
  @HttpCode(204)
  @RequirePermission(ADMIN_OBJECT_ID, 'delete')
  async deleteField(
    @WorkspaceContext() ctx: RequestContext,
    @Param('apiName') apiName: string,
    @Param('fieldApiName') fieldApiName: string,
  ) {
    await this.metadata.deleteField(ctx, apiName, fieldApiName);
  }
}
