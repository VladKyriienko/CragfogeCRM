import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, memberships, roles, sql, users, withWorkspace } from '@cragfoge/db';
import {
  createRoleBodySchema,
  memberSchema,
  roleSchema,
  updateMemberRoleBodySchema,
  type CreateRoleBody,
  type UpdateMemberRoleBody,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { StripeBillingService } from '../billing/stripe-billing.service';
import type { RequestContext } from '../common/request-context';

@Injectable()
export class RolesService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StripeBillingService) private readonly stripeBilling: StripeBillingService,
  ) {}

  async listRoles(ctx: RequestContext) {
    return withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const rows = await tx.select().from(roles).where(eq(roles.workspaceId, ctx.workspaceId));
        return rows.map((row) =>
          roleSchema.parse({
            id: row.id,
            name: row.name,
            key: row.key,
            isSystem: row.isSystem,
          }),
        );
      },
      { userId: ctx.user.id },
    );
  }

  async createRole(ctx: RequestContext, body: CreateRoleBody) {
    const input = createRoleBodySchema.parse(body);
    if (input.key === 'owner' || input.key === 'admin' || input.key === 'member') {
      throw new BadRequestException('Cannot reuse a system role key');
    }

    const role = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [created] = await tx
          .insert(roles)
          .values({
            workspaceId: ctx.workspaceId,
            name: input.name,
            key: input.key,
            isSystem: false,
          })
          .returning();
        if (!created) {
          throw new ConflictException('Could not create role');
        }
        return created;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'role.create',
      entityType: 'role',
      entityId: role.id,
      diff: { name: role.name, key: role.key },
    });

    return roleSchema.parse({
      id: role.id,
      name: role.name,
      key: role.key,
      isSystem: role.isSystem,
    });
  }

  async listMembers(ctx: RequestContext) {
    return withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const rows = await tx
          .select({
            id: memberships.id,
            userId: users.id,
            email: users.email,
            name: users.name,
            roleId: roles.id,
            roleName: roles.name,
            roleKey: roles.key,
          })
          .from(memberships)
          .innerJoin(users, eq(memberships.userId, users.id))
          .innerJoin(roles, eq(memberships.roleId, roles.id))
          .where(eq(memberships.workspaceId, ctx.workspaceId));

        return rows.map((row) => memberSchema.parse(row));
      },
      { userId: ctx.user.id },
    );
  }

  async updateMemberRole(
    ctx: RequestContext,
    membershipId: string,
    body: UpdateMemberRoleBody,
  ) {
    const input = updateMemberRoleBodySchema.parse(body);

    const updated = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [membership] = await tx
          .select({
            id: memberships.id,
            roleKey: roles.key,
          })
          .from(memberships)
          .innerJoin(roles, eq(memberships.roleId, roles.id))
          .where(
            and(eq(memberships.id, membershipId), eq(memberships.workspaceId, ctx.workspaceId)),
          )
          .limit(1);
        if (!membership) {
          throw new NotFoundException('Member not found');
        }
        if (membership.roleKey === 'owner') {
          throw new BadRequestException('Cannot change the Owner role assignment');
        }

        const [role] = await tx
          .select()
          .from(roles)
          .where(and(eq(roles.id, input.roleId), eq(roles.workspaceId, ctx.workspaceId)))
          .limit(1);
        if (!role) {
          throw new NotFoundException('Role not found');
        }
        if (role.key === 'owner') {
          throw new BadRequestException('Cannot assign the Owner role');
        }

        await tx
          .update(memberships)
          .set({ roleId: role.id })
          .where(eq(memberships.id, membershipId));

        return role;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'membership.role_change',
      entityType: 'membership',
      entityId: membershipId,
      diff: { roleId: updated.id, roleKey: updated.key },
    });

    return { ok: true as const };
  }

  async removeMember(ctx: RequestContext, membershipId: string) {
    await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [membership] = await tx
          .select({
            id: memberships.id,
            userId: memberships.userId,
            roleKey: roles.key,
          })
          .from(memberships)
          .innerJoin(roles, eq(memberships.roleId, roles.id))
          .where(
            and(eq(memberships.id, membershipId), eq(memberships.workspaceId, ctx.workspaceId)),
          )
          .limit(1);
        if (!membership) {
          throw new NotFoundException('Member not found');
        }
        if (membership.userId === ctx.user.id) {
          throw new BadRequestException('Cannot remove yourself');
        }
        if (membership.roleKey === 'owner') {
          const [ownerCount] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(memberships)
            .innerJoin(roles, eq(memberships.roleId, roles.id))
            .where(
              and(eq(memberships.workspaceId, ctx.workspaceId), eq(roles.key, 'owner')),
            );
          if ((ownerCount?.count ?? 0) <= 1) {
            throw new BadRequestException('Cannot remove the last Owner');
          }
        }

        await tx.delete(memberships).where(eq(memberships.id, membership.id));
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'membership.remove',
      entityType: 'membership',
      entityId: membershipId,
    });

    await this.stripeBilling.syncSeatQuantity(ctx.workspaceId);

    return { ok: true as const };
  }
}
