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
import { ADMIN_OBJECT_ID, type CreateWebhookBody, type UpdateWebhookBody } from '@cragfoge/shared';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext } from '../common/request-context';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiCookieAuth()
@ApiHeader({ name: 'X-Workspace-Id', required: true })
@Controller('webhooks')
@UseGuards(AuthGuard, WorkspaceGuard, PermissionGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @RequirePermission(ADMIN_OBJECT_ID, 'read')
  list(@WorkspaceContext() ctx: RequestContext) {
    return this.webhooks.list(ctx);
  }

  @Post()
  @RequirePermission(ADMIN_OBJECT_ID, 'create')
  create(@WorkspaceContext() ctx: RequestContext, @Body() body: CreateWebhookBody) {
    return this.webhooks.create(ctx, body);
  }

  @Patch(':id')
  @RequirePermission(ADMIN_OBJECT_ID, 'update')
  update(
    @WorkspaceContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: UpdateWebhookBody,
  ) {
    return this.webhooks.update(ctx, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(ADMIN_OBJECT_ID, 'delete')
  async remove(@WorkspaceContext() ctx: RequestContext, @Param('id') id: string) {
    await this.webhooks.remove(ctx, id);
  }

  @Get(':id/deliveries')
  @RequirePermission(ADMIN_OBJECT_ID, 'read')
  listDeliveries(@WorkspaceContext() ctx: RequestContext, @Param('id') id: string) {
    return this.webhooks.listDeliveries(ctx, id);
  }

  @Post(':id/deliveries/:deliveryId/resend')
  @RequirePermission(ADMIN_OBJECT_ID, 'update')
  resend(
    @WorkspaceContext() ctx: RequestContext,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.webhooks.resend(ctx, id, deliveryId);
  }
}
