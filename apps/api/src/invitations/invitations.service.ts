import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  eq,
  invitations,
  isNull,
  memberships,
  roles,
  sql,
  users,
  withWorkspace,
  workspaces,
  type AppDatabase,
} from '@cragfoge/db';
import {
  acceptInvitationBodySchema,
  createInvitationBodySchema,
  invitationSchema,
  type AcceptInvitationBody,
  type CreateInvitationBody,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { StripeBillingService } from '../billing/stripe-billing.service';
import type { RequestContext, RequestUser } from '../common/request-context';
import type { Env } from '../config/env';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email.types';
import { APP_DB, ENV } from '../tokens';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(StripeBillingService) private readonly stripeBilling: StripeBillingService,
  ) {}

  async create(ctx: RequestContext, body: CreateInvitationBody) {
    await this.entitlements.assertCanInvite(ctx.workspaceId, ctx.user.id);
    const input = createInvitationBodySchema.parse(body);
    const email = input.email.toLowerCase();

    const result = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [role] = await tx
          .select()
          .from(roles)
          .where(and(eq(roles.id, input.roleId), eq(roles.workspaceId, ctx.workspaceId)))
          .limit(1);
        if (!role) {
          throw new NotFoundException('Role not found');
        }
        if (role.key === 'owner') {
          throw new BadRequestException('Cannot invite as Owner');
        }

        const [workspace] = await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, ctx.workspaceId))
          .limit(1);
        if (!workspace) {
          throw new NotFoundException('Workspace not found');
        }

        const [existingUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existingUser) {
          const [existingMembership] = await tx
            .select({ id: memberships.id })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, ctx.workspaceId),
                eq(memberships.userId, existingUser.id),
              ),
            )
            .limit(1);
          if (existingMembership) {
            throw new ConflictException('User is already a member');
          }
        }

        await tx
          .delete(invitations)
          .where(
            and(
              eq(invitations.workspaceId, ctx.workspaceId),
              eq(invitations.email, email),
              isNull(invitations.acceptedAt),
            ),
          );

        const token = randomBytes(32).toString('base64url');
        const [invite] = await tx
          .insert(invitations)
          .values({
            workspaceId: ctx.workspaceId,
            email,
            roleId: role.id,
            tokenHash: hashToken(token),
            invitedByUserId: ctx.user.id,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          })
          .returning();
        if (!invite) {
          throw new ConflictException('Could not create invitation');
        }

        return { invite, role, workspace, token };
      },
      { userId: ctx.user.id },
    );

    const acceptUrl = `${this.env.WEB_ORIGIN}/invite/accept?token=${result.token}`;
    await this.email.send({
      to: email,
      subject: `Join ${result.workspace.name} on Cragfoge CRM`,
      text: `You were invited to ${result.workspace.name}. Accept: ${acceptUrl}`,
      html: `<p>You were invited to <strong>${result.workspace.name}</strong>.</p><p><a href="${acceptUrl}">Accept invitation</a></p>`,
    });

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'invitation.create',
      entityType: 'invitation',
      entityId: result.invite.id,
      diff: { email, roleId: result.role.id },
    });

    const invitation = invitationSchema.parse({
      id: result.invite.id,
      workspaceId: result.invite.workspaceId,
      email: result.invite.email,
      roleId: result.invite.roleId,
      roleName: result.role.name,
      expiresAt: result.invite.expiresAt.toISOString(),
      acceptedAt: null,
      createdAt: result.invite.createdAt.toISOString(),
    });

    // Tests cannot read Mailpit reliably in CI; expose the raw token only in test.
    if (this.env.NODE_ENV === 'test') {
      return { ...invitation, token: result.token };
    }
    return invitation;
  }

  async list(ctx: RequestContext) {
    return withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const rows = await tx
          .select({
            id: invitations.id,
            workspaceId: invitations.workspaceId,
            email: invitations.email,
            roleId: invitations.roleId,
            roleName: roles.name,
            expiresAt: invitations.expiresAt,
            acceptedAt: invitations.acceptedAt,
            createdAt: invitations.createdAt,
          })
          .from(invitations)
          .innerJoin(roles, eq(invitations.roleId, roles.id))
          .where(and(eq(invitations.workspaceId, ctx.workspaceId), isNull(invitations.acceptedAt)));

        return rows.map((row) =>
          invitationSchema.parse({
            ...row,
            expiresAt: row.expiresAt.toISOString(),
            acceptedAt: row.acceptedAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
          }),
        );
      },
      { userId: ctx.user.id },
    );
  }

  async accept(user: RequestUser, body: AcceptInvitationBody) {
    const input = acceptInvitationBodySchema.parse(body);
    const tokenHash = hashToken(input.token);

    const inviteRows = await this.db.execute<{
      id: string;
      workspace_id: string;
      email: string;
      role_id: string;
      token_hash: string;
      invited_by_user_id: string;
      expires_at: Date;
      accepted_at: Date | null;
      created_at: Date;
    }>(sql`select * from app_get_invitation_by_token_hash(${tokenHash})`);
    const inviteRow = inviteRows[0];
    if (!inviteRow) {
      throw new NotFoundException('Invitation not found');
    }
    const invite = {
      id: inviteRow.id,
      workspaceId: inviteRow.workspace_id,
      email: inviteRow.email,
      roleId: inviteRow.role_id,
      tokenHash: inviteRow.token_hash,
      invitedByUserId: inviteRow.invited_by_user_id,
      expiresAt: new Date(inviteRow.expires_at),
      acceptedAt: inviteRow.accepted_at ? new Date(inviteRow.accepted_at) : null,
      createdAt: new Date(inviteRow.created_at),
    };
    if (invite.acceptedAt) {
      throw new NotFoundException('Invitation not found');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invitation expired');
    }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException('Invitation email does not match the signed-in user');
    }

    const alreadyMember = await withWorkspace(
      invite.workspaceId,
      async (tx) => {
        const [existing] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(eq(memberships.workspaceId, invite.workspaceId), eq(memberships.userId, user.id)),
          )
          .limit(1);
        return Boolean(existing);
      },
      { userId: user.id },
    );

    if (!alreadyMember) {
      await this.entitlements.assertCanInvite(invite.workspaceId, user.id);
    }

    await withWorkspace(
      invite.workspaceId,
      async (tx) => {
        if (!alreadyMember) {
          await tx.insert(memberships).values({
            workspaceId: invite.workspaceId,
            userId: user.id,
            roleId: invite.roleId,
          });
        }
        await tx
          .update(invitations)
          .set({ acceptedAt: new Date() })
          .where(eq(invitations.id, invite.id));
      },
      { userId: user.id },
    );

    await this.audit.log({
      workspaceId: invite.workspaceId,
      actorUserId: user.id,
      action: 'invitation.accept',
      entityType: 'invitation',
      entityId: invite.id,
    });

    if (!alreadyMember) {
      await this.stripeBilling.syncSeatQuantity(invite.workspaceId);
    }

    return { workspaceId: invite.workspaceId };
  }
}
