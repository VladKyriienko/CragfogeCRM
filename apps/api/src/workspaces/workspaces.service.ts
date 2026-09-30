import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  eq,
  memberships,
  roles,
  applyWorkspaceTemplate,
  withUser,
  withWorkspace,
  workspaces,
  type AppDatabase,
} from '@cragfoge/db';
import {
  createWorkspaceBodySchema,
  workspaceSchema,
  type CreateWorkspaceBody,
  type WorkspaceDto,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { TRIAL_DURATION_MS } from '../billing/license-crypto';
import type { RequestUser } from '../common/request-context';
import type { Env } from '../config/env';
import { APP_DB, ENV } from '../tokens';

const SYSTEM_ROLES = [
  { key: 'owner', name: 'Owner' },
  { key: 'admin', name: 'Admin' },
  { key: 'member', name: 'Member' },
] as const;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'workspace'
  );
}

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(user: RequestUser, body: CreateWorkspaceBody): Promise<WorkspaceDto> {
    const input = createWorkspaceBodySchema.parse(body);
    const baseSlug = slugify(input.name);
    let slug = baseSlug;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const [existing] = await this.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, slug))
        .limit(1);
      if (!existing) {
        break;
      }
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const cloudTrial =
      this.env.DEPLOYMENT_MODE === 'cloud'
        ? {
            plan: 'pro',
            billingStatus: 'trialing' as const,
            trialEndsAt: new Date(Date.now() + TRIAL_DURATION_MS),
          }
        : {
            plan: 'free',
            billingStatus: 'none' as const,
            trialEndsAt: null,
          };

    const [workspace] = await this.db
      .insert(workspaces)
      .values({
        name: input.name,
        slug,
        timezone: input.timezone,
        currency: input.currency,
        locale: input.locale,
        ...cloudTrial,
      })
      .returning();
    if (!workspace) {
      throw new ConflictException('Could not create workspace');
    }

    const ownerRole = await withWorkspace(
      workspace.id,
      async (tx) => {
        const createdRoles = await tx
          .insert(roles)
          .values(
            SYSTEM_ROLES.map((role) => ({
              workspaceId: workspace.id,
              name: role.name,
              key: role.key,
              isSystem: true,
            })),
          )
          .returning();

        const owner = createdRoles.find((role) => role.key === 'owner');
        if (!owner) {
          throw new ConflictException('Owner role was not created');
        }

        await tx.insert(memberships).values({
          workspaceId: workspace.id,
          userId: user.id,
          roleId: owner.id,
        });
        await applyWorkspaceTemplate(tx, {
          workspaceId: workspace.id,
          ownerUserId: user.id,
          templateId: input.templateId,
          includeSampleData: input.includeSampleData,
          currency: input.currency,
        });
        return owner;
      },
      { userId: user.id },
    );

    await this.audit.log({
      workspaceId: workspace.id,
      actorUserId: user.id,
      action: 'workspace.create',
      entityType: 'workspace',
      entityId: workspace.id,
      diff: {
        name: workspace.name,
        slug: workspace.slug,
        templateId: input.templateId,
        includeSampleData: input.includeSampleData,
      },
    });

    return workspaceSchema.parse({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      timezone: workspace.timezone,
      currency: workspace.currency,
      locale: workspace.locale,
      plan: workspace.plan,
      roleKey: ownerRole.key,
      roleName: ownerRole.name,
      deletionScheduledAt: workspace.deletionScheduledAt?.toISOString() ?? null,
    });
  }

  async listForUser(userId: string): Promise<WorkspaceDto[]> {
    const rows = await withUser(userId, (tx) =>
      tx
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          timezone: workspaces.timezone,
          currency: workspaces.currency,
          locale: workspaces.locale,
          plan: workspaces.plan,
          roleKey: roles.key,
          roleName: roles.name,
          deletionScheduledAt: workspaces.deletionScheduledAt,
        })
        .from(memberships)
        .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
        .innerJoin(roles, eq(memberships.roleId, roles.id))
        .where(eq(memberships.userId, userId)),
    );

    return rows.map((row) =>
      workspaceSchema.parse({
        ...row,
        deletionScheduledAt: row.deletionScheduledAt?.toISOString() ?? null,
      }),
    );
  }

  async getForUser(userId: string, workspaceId: string): Promise<WorkspaceDto> {
    return withWorkspace(
      workspaceId,
      async (tx) => {
        const [row] = await tx
          .select({
            id: workspaces.id,
            name: workspaces.name,
            slug: workspaces.slug,
            timezone: workspaces.timezone,
            currency: workspaces.currency,
            locale: workspaces.locale,
            plan: workspaces.plan,
            roleKey: roles.key,
            roleName: roles.name,
            deletionScheduledAt: workspaces.deletionScheduledAt,
          })
          .from(memberships)
          .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
          .innerJoin(roles, eq(memberships.roleId, roles.id))
          .where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId)))
          .limit(1);

        if (!row) {
          throw new NotFoundException('Workspace not found');
        }
        return workspaceSchema.parse({
          ...row,
          deletionScheduledAt: row.deletionScheduledAt?.toISOString() ?? null,
        });
      },
      { userId },
    );
  }

  async scheduleDeletion(userId: string, workspaceId: string): Promise<WorkspaceDto> {
    await this.requireOwner(userId, workspaceId);
    const scheduled = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.db
      .update(workspaces)
      .set({ deletionScheduledAt: scheduled })
      .where(eq(workspaces.id, workspaceId));
    await this.audit.log({
      workspaceId,
      actorUserId: userId,
      action: 'workspace.delete_scheduled',
      entityType: 'workspace',
      entityId: workspaceId,
      diff: { deletionScheduledAt: scheduled.toISOString() },
    });
    return this.getForUser(userId, workspaceId);
  }

  async cancelDeletion(userId: string, workspaceId: string): Promise<WorkspaceDto> {
    await this.requireOwner(userId, workspaceId);
    await this.db
      .update(workspaces)
      .set({ deletionScheduledAt: null })
      .where(eq(workspaces.id, workspaceId));
    await this.audit.log({
      workspaceId,
      actorUserId: userId,
      action: 'workspace.delete_cancelled',
      entityType: 'workspace',
      entityId: workspaceId,
      diff: { deletionScheduledAt: null },
    });
    return this.getForUser(userId, workspaceId);
  }

  private async requireOwner(userId: string, workspaceId: string): Promise<void> {
    const workspace = await this.getForUser(userId, workspaceId);
    if (workspace.roleKey !== 'owner') {
      throw new ForbiddenException('Only the workspace Owner can manage deletion');
    }
  }
}
