import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activities,
  apiKeys,
  auditLogs,
  automations,
  closeAppDb,
  fieldDefinitions,
  getAppDb,
  invitations,
  memberships,
  objectDefinitions,
  openDatabase,
  prepareDatabase,
  records,
  roleObjectPermissions,
  roles,
  users,
  webhookSubscriptions,
  withUser,
  withWorkspace,
  workspaces,
} from './index';
import { DEFAULT_MIGRATOR_DATABASE_URL } from './defaults';

function errorChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    parts.push(current.message);
    current = 'cause' in current ? current.cause : undefined;
  }
  return parts.join('\n');
}

describe('tenant isolation', () => {
  let migrator: ReturnType<typeof openDatabase> | undefined;

  const workspaceAId = randomUUID();
  const workspaceBId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const roleAId = randomUUID();
  const roleBId = randomUUID();
  const membershipAId = randomUUID();
  const membershipBId = randomUUID();
  const inviteAId = randomUUID();
  const inviteBId = randomUUID();
  const objectAId = randomUUID();
  const objectBId = randomUUID();
  const objectPermAId = randomUUID();
  const objectPermBId = randomUUID();
  const fieldAId = randomUUID();
  const fieldBId = randomUUID();
  const recordAId = randomUUID();
  const recordBId = randomUUID();
  const auditAId = randomUUID();
  const auditBId = randomUUID();
  const apiKeyAId = randomUUID();
  const apiKeyBId = randomUUID();
  const webhookAId = randomUUID();
  const webhookBId = randomUUID();
  const automationAId = randomUUID();
  const automationBId = randomUUID();
  const activityAId = randomUUID();
  const activityBId = randomUUID();

  beforeAll(async () => {
    await prepareDatabase();
    migrator = openDatabase(process.env.DATABASE_URL_MIGRATOR ?? DEFAULT_MIGRATOR_DATABASE_URL);
    await migrator.db.execute(
      sql`truncate table stripe_webhook_events, instance_license, automation_runs, automations, webhook_deliveries, webhook_subscriptions, api_keys, activities, export_jobs, files, views, record_relations, records, field_definitions, object_definitions, role_object_permissions, role_field_permissions, invitations, audit_logs, memberships, roles, two_factors, sessions, accounts, verifications, users, workspaces restart identity cascade`,
    );

    await migrator.db.insert(workspaces).values([
      {
        id: workspaceAId,
        name: 'Workspace A',
        slug: `a-${workspaceAId}`,
      },
      {
        id: workspaceBId,
        name: 'Workspace B',
        slug: `b-${workspaceBId}`,
      },
    ]);

    await migrator.db.insert(users).values([
      {
        id: userId,
        email: `user-${userId}@example.com`,
        name: 'Test User',
        emailVerified: true,
      },
      {
        id: otherUserId,
        email: `other-${otherUserId}@example.com`,
        name: 'Other User',
        emailVerified: true,
      },
    ]);

    await migrator.db.insert(roles).values([
      { id: roleAId, workspaceId: workspaceAId, name: 'Owner', key: 'owner', isSystem: true },
      { id: roleBId, workspaceId: workspaceBId, name: 'Owner', key: 'owner', isSystem: true },
    ]);

    await migrator.db.insert(memberships).values([
      { id: membershipAId, workspaceId: workspaceAId, userId, roleId: roleAId },
      { id: membershipBId, workspaceId: workspaceBId, userId, roleId: roleBId },
    ]);

    await migrator.db.insert(invitations).values([
      {
        id: inviteAId,
        workspaceId: workspaceAId,
        email: 'a@example.com',
        roleId: roleAId,
        tokenHash: `hash-a-${inviteAId}`,
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      {
        id: inviteBId,
        workspaceId: workspaceBId,
        email: 'b@example.com',
        roleId: roleBId,
        tokenHash: `hash-b-${inviteBId}`,
        invitedByUserId: userId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    ]);

    await migrator.db.insert(objectDefinitions).values([
      {
        id: objectAId,
        workspaceId: workspaceAId,
        apiName: 'widgets',
        labelSingular: 'Widget',
        labelPlural: 'Widgets',
      },
      {
        id: objectBId,
        workspaceId: workspaceBId,
        apiName: 'widgets',
        labelSingular: 'Widget',
        labelPlural: 'Widgets',
      },
    ]);

    await migrator.db.insert(fieldDefinitions).values([
      {
        id: fieldAId,
        workspaceId: workspaceAId,
        objectId: objectAId,
        apiName: 'color',
        label: 'Color',
        type: 'text',
      },
      {
        id: fieldBId,
        workspaceId: workspaceBId,
        objectId: objectBId,
        apiName: 'color',
        label: 'Color',
        type: 'text',
      },
    ]);

    await migrator.db.insert(records).values([
      {
        id: recordAId,
        workspaceId: workspaceAId,
        objectId: objectAId,
        name: 'Record A',
        ownerId: userId,
        createdBy: userId,
        data: { color: 'red' },
      },
      {
        id: recordBId,
        workspaceId: workspaceBId,
        objectId: objectBId,
        name: 'Record B',
        ownerId: userId,
        createdBy: userId,
        data: { color: 'blue' },
      },
    ]);

    await migrator.db.insert(roleObjectPermissions).values([
      {
        id: objectPermAId,
        workspaceId: workspaceAId,
        roleId: roleAId,
        objectId: objectAId,
        canRead: true,
      },
      {
        id: objectPermBId,
        workspaceId: workspaceBId,
        roleId: roleBId,
        objectId: objectBId,
        canRead: true,
      },
    ]);

    await migrator.db.insert(auditLogs).values([
      {
        id: auditAId,
        workspaceId: workspaceAId,
        actorUserId: userId,
        action: 'test.a',
        entityType: 'workspace',
        entityId: workspaceAId,
      },
      {
        id: auditBId,
        workspaceId: workspaceBId,
        actorUserId: userId,
        action: 'test.b',
        entityType: 'workspace',
        entityId: workspaceBId,
      },
    ]);

    await migrator.db.insert(apiKeys).values([
      {
        id: apiKeyAId,
        workspaceId: workspaceAId,
        name: 'Key A',
        keyPrefix: 'aaaa1111',
        keyHash: `hash-a-${apiKeyAId}`,
        scopes: { widgets: ['read'] },
        createdBy: userId,
      },
      {
        id: apiKeyBId,
        workspaceId: workspaceBId,
        name: 'Key B',
        keyPrefix: 'bbbb2222',
        keyHash: `hash-b-${apiKeyBId}`,
        scopes: { widgets: ['read', 'write'] },
        createdBy: userId,
      },
    ]);

    await migrator.db.insert(webhookSubscriptions).values([
      {
        id: webhookAId,
        workspaceId: workspaceAId,
        url: 'https://example.com/a',
        signingSecret: 'secret-a',
        events: ['record.created'],
        createdBy: userId,
      },
      {
        id: webhookBId,
        workspaceId: workspaceBId,
        url: 'https://example.com/b',
        signingSecret: 'secret-b',
        events: ['record.updated'],
        createdBy: userId,
      },
    ]);

    await migrator.db.insert(automations).values([
      {
        id: automationAId,
        workspaceId: workspaceAId,
        objectId: objectAId,
        name: 'Auto A',
        trigger: { type: 'record_created' },
        conditions: null,
        actions: [{ type: 'create_task', subject: 'Follow up' }],
        createdBy: userId,
      },
      {
        id: automationBId,
        workspaceId: workspaceBId,
        objectId: objectBId,
        name: 'Auto B',
        trigger: { type: 'stage_changed', to: 'won' },
        conditions: null,
        actions: [{ type: 'create_task', subject: 'Celebrate' }],
        createdBy: userId,
      },
    ]);

    await migrator.db.insert(activities).values([
      {
        id: activityAId,
        workspaceId: workspaceAId,
        recordId: recordAId,
        objectId: objectAId,
        type: 'task',
        subject: 'Task A',
        ownerId: userId,
        createdBy: userId,
      },
      {
        id: activityBId,
        workspaceId: workspaceBId,
        recordId: recordBId,
        objectId: objectBId,
        type: 'task',
        subject: 'Task B',
        ownerId: userId,
        createdBy: userId,
      },
    ]);
  });

  afterAll(async () => {
    if (migrator) {
      await migrator.db.execute(
        sql`truncate table stripe_webhook_events, instance_license, automation_runs, automations, webhook_deliveries, webhook_subscriptions, api_keys, activities, export_jobs, files, views, record_relations, records, field_definitions, object_definitions, role_object_permissions, role_field_permissions, invitations, audit_logs, memberships, roles, two_factors, sessions, accounts, verifications, users, workspaces restart identity cascade`,
      );
      await migrator.close();
    }
    await closeAppDb();
  });

  it('connects the app pool as crm_app without bypassrls', async () => {
    const [row] = await getAppDb().execute<{
      current_user: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(sql`
      select current_user, rolsuper, rolbypassrls
      from pg_roles
      where rolname = current_user
    `);

    expect(row?.current_user).toBe('crm_app');
    expect(row?.rolsuper).toBe(false);
    expect(row?.rolbypassrls).toBe(false);
  });

  it('crm_app with workspace A cannot select memberships of workspace B', async () => {
    const visible = await withWorkspace(workspaceAId, (tx) => tx.select().from(memberships));
    expect(visible.map((row) => row.id)).toEqual([membershipAId]);
  });

  it('crm_app with workspace A cannot select invitations or permissions of workspace B', async () => {
    const inviteRows = await withWorkspace(workspaceAId, (tx) => tx.select().from(invitations));
    expect(inviteRows.map((row) => row.id)).toEqual([inviteAId]);

    const permissionRows = await withWorkspace(workspaceAId, (tx) =>
      tx.select().from(roleObjectPermissions),
    );
    expect(permissionRows.map((row) => row.id)).toEqual([objectPermAId]);
  });

  it('crm_app with app.user_id can list own memberships across workspaces', async () => {
    const visible = await withUser(userId, (tx) => tx.select().from(memberships));
    expect(visible.map((row) => row.workspaceId).sort()).toEqual(
      [workspaceAId, workspaceBId].sort(),
    );
  });

  it('crm_app cannot insert a membership into another workspace', async () => {
    await expect(
      withWorkspace(workspaceAId, (tx) =>
        tx.insert(memberships).values({
          workspaceId: workspaceBId,
          userId: otherUserId,
          roleId: roleBId,
        }),
      ),
    ).rejects.toSatisfy((error: unknown) => /row-level security/i.test(errorChain(error)));
  });

  it('crm_app with workspace A cannot select roles of workspace B', async () => {
    const visible = await withWorkspace(workspaceAId, (tx) => tx.select().from(roles));
    expect(visible.map((row) => row.id)).toEqual([roleAId]);
  });

  it('crm_app with workspace A cannot select audit logs of workspace B', async () => {
    const visible = await withWorkspace(workspaceAId, (tx) => tx.select().from(auditLogs));
    expect(visible.map((row) => row.id)).toEqual([auditAId]);
  });

  it('crm_app with workspace A cannot select objects, fields, or records of workspace B', async () => {
    const objects = await withWorkspace(workspaceAId, (tx) => tx.select().from(objectDefinitions));
    expect(objects.map((row) => row.id)).toEqual([objectAId]);

    const fields = await withWorkspace(workspaceAId, (tx) => tx.select().from(fieldDefinitions));
    expect(fields.map((row) => row.id)).toEqual([fieldAId]);

    const recordRows = await withWorkspace(workspaceAId, (tx) => tx.select().from(records));
    expect(recordRows.map((row) => row.id)).toEqual([recordAId]);
  });

  it('crm_app with workspace A cannot select phase-6 tables of workspace B', async () => {
    const keys = await withWorkspace(workspaceAId, (tx) => tx.select().from(apiKeys));
    expect(keys.map((row) => row.id)).toEqual([apiKeyAId]);

    const hooks = await withWorkspace(workspaceAId, (tx) => tx.select().from(webhookSubscriptions));
    expect(hooks.map((row) => row.id)).toEqual([webhookAId]);

    const autos = await withWorkspace(workspaceAId, (tx) => tx.select().from(automations));
    expect(autos.map((row) => row.id)).toEqual([automationAId]);

    const acts = await withWorkspace(workspaceAId, (tx) => tx.select().from(activities));
    expect(acts.map((row) => row.id)).toEqual([activityAId]);
  });
});
