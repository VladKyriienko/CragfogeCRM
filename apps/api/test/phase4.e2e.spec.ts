import { type INestApplication } from '@nestjs/common';
import { closeAppDb, roleFieldPermissions, withWorkspace } from '@cragfoge/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/create-app';

type AuthBody = {
  user?: { id: string; email: string; name: string };
};

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((cookie) => cookie.split(';')[0]).join('; ');
}

async function signUp(
  app: INestApplication,
  input: { name: string; email: string; password: string },
) {
  const response = await request(app.getHttpServer())
    .post('/api/auth/sign-up/email')
    .send(input)
    .expect((res) => {
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
      }
    });
  return { body: response.body as AuthBody, cookie: cookieHeader(response) };
}

describe('phase 4: views, files, exports, search, bulk, members', () => {
  let app: INestApplication;
  const suffix = Date.now();
  const password = 'password-12345';
  const ownerEmail = `p4-owner-${suffix}@example.com`;
  const memberEmail = `p4-member-${suffix}@example.com`;
  let ownerCookie = '';
  let memberCookie = '';
  let workspaceId = '';
  let peopleFields: Array<{ id: string; apiName: string }> = [];

  beforeAll(async () => {
    app = await createApp();
    await app.init();

    const owner = await signUp(app, { name: 'P4 Owner', email: ownerEmail, password });
    ownerCookie = owner.cookie;

    const workspaceResponse = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', ownerCookie)
      .send({ name: `P4 WS ${suffix}`, timezone: 'UTC', currency: 'USD', locale: 'en' })
      .expect(201);
    workspaceId = workspaceResponse.body.id as string;

    const rolesResponse = await request(app.getHttpServer())
      .get('/roles')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const memberRole = (rolesResponse.body as Array<{ id: string; key: string }>).find(
      (role) => role.key === 'member',
    )!;

    const inviteResponse = await request(app.getHttpServer())
      .post('/invitations')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ email: memberEmail, roleId: memberRole.id })
      .expect(201);
    const inviteToken = (inviteResponse.body as { token?: string }).token;

    const member = await signUp(app, { name: 'P4 Member', email: memberEmail, password });
    memberCookie = member.cookie;
    await request(app.getHttpServer())
      .post('/invitations/accept')
      .set('Cookie', memberCookie)
      .send({ token: inviteToken })
      .expect(201);

    const fieldsResponse = await request(app.getHttpServer())
      .get('/objects/people/fields')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    peopleFields = fieldsResponse.body as Array<{ id: string; apiName: string }>;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await closeAppDb();
  });

  it('read-scoped metadata: non-admin members can read objects/fields, hidden fields are omitted', async () => {
    // Previously admin-only: a plain Member can now list/read objects and fields.
    const objects = await request(app.getHttpServer())
      .get('/objects')
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const apiNames = (objects.body as Array<{ apiName: string }>).map((o) => o.apiName).sort();
    expect(apiNames).toEqual(['companies', 'deals', 'people']);

    await request(app.getHttpServer())
      .get('/objects/people')
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    // Admin-gated mutations remain admin-gated.
    await request(app.getHttpServer())
      .post('/objects')
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ apiName: 'nope', labelSingular: 'Nope', labelPlural: 'Nopes' })
      .expect(403);

    const fieldsBefore = await request(app.getHttpServer())
      .get('/objects/people/fields')
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    for (const field of fieldsBefore.body as Array<{ visibility: string }>) {
      expect(['read', 'write']).toContain(field.visibility);
    }

    const rolesResponse = await request(app.getHttpServer())
      .get('/roles')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const memberRole = (rolesResponse.body as Array<{ id: string; key: string }>).find(
      (role) => role.key === 'member',
    )!;
    const phoneField = peopleFields.find((field) => field.apiName === 'phone')!;

    await withWorkspace(workspaceId, async (tx) => {
      await tx.insert(roleFieldPermissions).values({
        workspaceId,
        roleId: memberRole.id,
        fieldId: phoneField.id,
        visibility: 'hidden',
      });
    });

    const fieldsAfter = await request(app.getHttpServer())
      .get('/objects/people/fields')
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(
      (fieldsAfter.body as Array<{ apiName: string }>).some((f) => f.apiName === 'phone'),
    ).toBe(false);

    const created = await request(app.getHttpServer())
      .post('/objects/people/records')
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: 'Member Person',
        data: { phone: '555-0100', email: 'member-person@example.com' },
      })
      .expect(201);
    expect(created.body.data.phone).toBeUndefined();
    expect(created.body.data.email).toBe('member-person@example.com');

    const fetched = await request(app.getHttpServer())
      .get(`/objects/people/records/${created.body.id}`)
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(fetched.body.data.phone).toBeUndefined();

    // Owner's role has no hidden override: phone is still visible to the owner.
    const ownerFields = await request(app.getHttpServer())
      .get('/objects/people/fields')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const ownerPhone = (ownerFields.body as Array<{ apiName: string; visibility: string }>).find(
      (f) => f.apiName === 'phone',
    );
    expect(ownerPhone?.visibility).toBe('write');
  });

  it('views: owner CRUD, shared visibility, and edit rules', async () => {
    const privateView = await request(app.getHttpServer())
      .post('/objects/people/views')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'My View', columns: ['name', 'email'], isShared: false })
      .expect(201);

    const sharedView = await request(app.getHttpServer())
      .post('/objects/people/views')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Team View', columns: ['name'], isShared: true })
      .expect(201);

    const memberViews = await request(app.getHttpServer())
      .get('/objects/people/views')
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const memberViewNames = (memberViews.body as Array<{ name: string }>).map((v) => v.name);
    expect(memberViewNames).toContain('Team View');
    expect(memberViewNames).not.toContain('My View');

    // Not the owner and not an admin/owner role: cannot edit even a shared view.
    await request(app.getHttpServer())
      .patch(`/objects/people/views/${sharedView.body.id}`)
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Hacked' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/objects/people/views/${sharedView.body.id}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Team View v2' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/objects/people/views/${privateView.body.id}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/objects/people/views/${sharedView.body.id}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);
  });

  it('bulk update and bulk delete records', async () => {
    const first = await request(app.getHttpServer())
      .post('/objects/people/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Bulk One', data: {} })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/objects/people/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Bulk Two', data: {} })
      .expect(201);
    const ids = [first.body.id as string, second.body.id as string];

    const updateResult = await request(app.getHttpServer())
      .post('/objects/people/records/bulk-update')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ ids, data: { job_title: 'Bulk Updated' } })
      .expect(201);
    expect(updateResult.body.succeededIds.sort()).toEqual([...ids].sort());
    expect(updateResult.body.errors).toEqual([]);

    const refetched = await request(app.getHttpServer())
      .get(`/objects/people/records/${ids[0]}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(refetched.body.data.job_title).toBe('Bulk Updated');

    const deleteResult = await request(app.getHttpServer())
      .post('/objects/people/records/bulk-delete')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ ids })
      .expect(201);
    expect(deleteResult.body.succeededIds.sort()).toEqual([...ids].sort());

    await request(app.getHttpServer())
      .get(`/objects/people/records/${ids[0]}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(404);
  });

  it('global search finds records across readable objects', async () => {
    const created = await request(app.getHttpServer())
      .post('/objects/people/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Zzyzx Search Target', data: {} })
      .expect(201);

    const results = await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'Zzyzx' })
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const items = results.body.items as Array<{
      objectApiName: string;
      recordId: string;
      name: string;
    }>;
    expect(items.some((item) => item.recordId === created.body.id)).toBe(true);
    const hit = items.find((item) => item.recordId === created.body.id)!;
    expect(hit.objectApiName).toBe('people');
    expect(hit.name).toBe('Zzyzx Search Target');
  });

  it('members picker is available to any workspace member without admin permission', async () => {
    const response = await request(app.getHttpServer())
      .get('/workspace/members')
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const emails = (response.body as Array<{ email: string }>).map((m) => m.email);
    expect(emails).toEqual(expect.arrayContaining([ownerEmail, memberEmail]));
  });

  it('uploads, lists, and deletes a file on a record', async () => {
    const record = await request(app.getHttpServer())
      .post('/objects/people/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'File Owner', data: {} })
      .expect(201);
    const recordId = record.body.id as string;
    const content = Buffer.from('hello world', 'utf8');

    const uploaded = await request(app.getHttpServer())
      .post(`/objects/people/records/${recordId}/files`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'note.txt', mimeType: 'text/plain', data: content.toString('base64') })
      .expect(201);
    expect(uploaded.body.sizeBytes).toBe(content.length);
    expect(uploaded.body.name).toBe('note.txt');

    const list = await request(app.getHttpServer())
      .get(`/objects/people/records/${recordId}/files`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(list.body).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/objects/people/records/${recordId}/files/${uploaded.body.id}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);

    const listAfter = await request(app.getHttpServer())
      .get(`/objects/people/records/${recordId}/files`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(listAfter.body).toHaveLength(0);
  });

  it('runs a CSV export synchronously in tests and serves the download', async () => {
    await request(app.getHttpServer())
      .post('/objects/people/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Export Target', data: { email: 'export-target@example.com' } })
      .expect(201);

    const job = await request(app.getHttpServer())
      .post('/objects/people/exports')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ columns: ['name', 'email'] })
      .expect(201);
    expect(job.body.status).toBe('completed');
    expect(job.body.downloadPath).toBeTruthy();

    const status = await request(app.getHttpServer())
      .get(`/objects/people/exports/${job.body.id}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(status.body.status).toBe('completed');

    const download = await request(app.getHttpServer())
      .get(`/objects/people/exports/${job.body.id}/download`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(download.headers['content-type']).toContain('text/csv');
    expect(download.text.split('\n')[0]).toBe('name,email');
    expect(download.text).toContain('Export Target');
    expect(download.text).toContain('export-target@example.com');

    // Another member cannot read someone else's export job.
    await request(app.getHttpServer())
      .get(`/objects/people/exports/${job.body.id}`)
      .set('Cookie', memberCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(403);
  });
});
