import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ADMIN_OBJECT_ID, type ActivateLicenseBody } from '@cragfoge/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { WorkspaceContext } from '../common/decorators/workspace-context.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { RequestContext, RequestUser } from '../common/request-context';
import { EntitlementsService } from './entitlements.service';
import { LicenseService } from './license.service';
import { StripeBillingService } from './stripe-billing.service';

@ApiTags('billing')
@ApiCookieAuth()
@Controller('billing')
export class BillingController {
  constructor(
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(LicenseService) private readonly licenses: LicenseService,
    @Inject(StripeBillingService) private readonly stripeBilling: StripeBillingService,
  ) {}

  @Get('entitlements')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @UseGuards(AuthGuard, WorkspaceGuard)
  getEntitlements(@WorkspaceContext() ctx: RequestContext) {
    return this.entitlements.getStatus(ctx.workspaceId, ctx.user.id);
  }

  @Post('checkout')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @UseGuards(AuthGuard, WorkspaceGuard, PermissionGuard)
  @RequirePermission(ADMIN_OBJECT_ID, 'create')
  checkout(@WorkspaceContext() ctx: RequestContext, @CurrentUser() user: RequestUser) {
    return this.stripeBilling.createCheckoutSession(ctx.workspaceId, user.email);
  }

  @Post('portal')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @UseGuards(AuthGuard, WorkspaceGuard, PermissionGuard)
  @RequirePermission(ADMIN_OBJECT_ID, 'update')
  portal(@WorkspaceContext() ctx: RequestContext) {
    return this.stripeBilling.createPortalSession(ctx.workspaceId);
  }

  @Post('license')
  @ApiHeader({ name: 'X-Workspace-Id', required: true })
  @UseGuards(AuthGuard, WorkspaceGuard, PermissionGuard)
  @RequirePermission(ADMIN_OBJECT_ID, 'update')
  activateLicense(@Body() body: ActivateLicenseBody) {
    return this.licenses.activate(body);
  }
}
