import {
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  eq,
  memberships,
  sql,
  withWorkspace,
  workspaces,
  type AppDatabase,
  type BillingStatus,
} from '@cragfoge/db';
import {
  entitlementsSchema,
  type EntitlementAction,
  type EntitlementsDto,
} from '@cragfoge/shared';
import type { Env } from '../config/env';
import { APP_DB, ENV } from '../tokens';
import {
  CLOUD_TRIAL_SEAT_LIMIT,
  FREE_MODE_SEAT_LIMIT,
  PAST_DUE_GRACE_MS,
} from './license-crypto';
import { LicenseService } from './license.service';

@Injectable()
export class EntitlementsService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(ENV) private readonly env: Env,
    @Inject(LicenseService) private readonly licenses: LicenseService,
  ) {}

  async countMembers(workspaceId: string, userId?: string): Promise<number> {
    return withWorkspace(
      workspaceId,
      async (tx) => {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(memberships)
          .where(eq(memberships.workspaceId, workspaceId));
        return row?.count ?? 0;
      },
      userId ? { userId } : undefined,
    );
  }

  async getStatus(workspaceId: string, userId?: string): Promise<EntitlementsDto> {
    const [workspace] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) {
      throw new ForbiddenException('Workspace not found');
    }

    const seatsUsed = await this.countMembers(workspaceId, userId);
    const now = Date.now();

    if (this.env.DEPLOYMENT_MODE === 'selfhost') {
      const license = await this.licenses.getActive();
      const seatLimit = license.seats;
      const overSeatLimit = seatsUsed > seatLimit;
      const canInviteMember = seatsUsed < seatLimit;
      return entitlementsSchema.parse({
        deploymentMode: 'selfhost',
        billingStatus: 'none',
        plan: workspace.plan,
        seatLimit,
        seatsUsed,
        isReadOnly: false,
        canInviteMember,
        trialEndsAt: null,
        pastDueSince: null,
        pastDueGraceActive: false,
        hasValidLicense: license.valid,
        licensee: license.licensee,
        licenseExpiresAt: license.expiresAt?.toISOString() ?? null,
        overSeatLimit,
      });
    }

    const billingStatus = this.resolveCloudStatus(workspace, now);
    const pastDueGraceActive =
      workspace.billingStatus === 'past_due' &&
      workspace.pastDueSince != null &&
      now - workspace.pastDueSince.getTime() <= PAST_DUE_GRACE_MS;

    const isReadOnly =
      billingStatus === 'canceled' ||
      (workspace.billingStatus === 'past_due' && !pastDueGraceActive) ||
      (workspace.billingStatus === 'trialing' &&
        workspace.trialEndsAt != null &&
        workspace.trialEndsAt.getTime() < now &&
        !workspace.stripeSubscriptionId);

    let seatLimit: number | null = null;
    let canInviteMember = !isReadOnly;

    if (billingStatus === 'trialing' && !isReadOnly) {
      seatLimit = CLOUD_TRIAL_SEAT_LIMIT;
      canInviteMember = seatsUsed < CLOUD_TRIAL_SEAT_LIMIT;
    } else if (billingStatus === 'active' || pastDueGraceActive) {
      seatLimit = null;
      canInviteMember = !isReadOnly;
    } else {
      seatLimit = seatsUsed;
      canInviteMember = false;
    }

    return entitlementsSchema.parse({
      deploymentMode: 'cloud',
      billingStatus,
      plan: workspace.plan,
      seatLimit,
      seatsUsed,
      isReadOnly,
      canInviteMember,
      trialEndsAt: workspace.trialEndsAt?.toISOString() ?? null,
      pastDueSince: workspace.pastDueSince?.toISOString() ?? null,
      pastDueGraceActive,
      hasValidLicense: false,
      licensee: null,
      licenseExpiresAt: null,
      overSeatLimit: seatLimit != null ? seatsUsed > seatLimit : false,
    });
  }

  async can(workspaceId: string, action: EntitlementAction, userId?: string): Promise<boolean> {
    const status = await this.getStatus(workspaceId, userId);
    if (action === 'invite_member') {
      return status.canInviteMember;
    }
    return false;
  }

  async seatLimit(workspaceId: string, userId?: string): Promise<number | null> {
    const status = await this.getStatus(workspaceId, userId);
    return status.seatLimit;
  }

  async isReadOnly(workspaceId: string, userId?: string): Promise<boolean> {
    const status = await this.getStatus(workspaceId, userId);
    return status.isReadOnly;
  }

  async assertCanInvite(workspaceId: string, userId?: string): Promise<void> {
    const allowed = await this.can(workspaceId, 'invite_member', userId);
    if (!allowed) {
      throw new ForbiddenException('Seat limit reached or workspace is read-only');
    }
  }

  async assertWritable(workspaceId: string, userId?: string): Promise<void> {
    if (await this.isReadOnly(workspaceId, userId)) {
      throw new ForbiddenException('Workspace is read-only. Export is still allowed.');
    }
  }

  private resolveCloudStatus(
    workspace: {
      billingStatus: BillingStatus;
      trialEndsAt: Date | null;
      stripeSubscriptionId: string | null;
      pastDueSince: Date | null;
    },
    now: number,
  ): BillingStatus {
    if (workspace.billingStatus === 'trialing') {
      if (
        workspace.trialEndsAt != null &&
        workspace.trialEndsAt.getTime() < now &&
        !workspace.stripeSubscriptionId
      ) {
        return 'canceled';
      }
      return 'trialing';
    }
    if (workspace.billingStatus === 'past_due') {
      return 'past_due';
    }
    return workspace.billingStatus;
  }
}
