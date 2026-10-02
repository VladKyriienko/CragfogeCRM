import { type INestApplication } from '@nestjs/common';
import { closeAppDb } from '@cragfoge/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/create-app';

/**
 * HTTP-level cross-tenant checks: user B (owner of workspace B) must not be able to read,
 * change or even detect resources that belong to workspace A, through any module.
 * The database-level proof lives in packages/db (tenant.test.ts, rls-audit.test.ts).
 */

type Tenant = {
  cookie: string;
  workspaceId: string;
  peopleObjectId: string;
  recordId: string;
  viewId: string;
  webhookId: string;
  apiKeyId: string;
  apiKey: string;
  automationId: string;
  exportJobId: string;
  fileId: string;
  activityId: string;
};

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('cross-tenant isolation over HTTP', () => {
  let app: INestApplication;
  const suffix = Date.now();
  let a: Tenant;
  let b: Tenant;

  const http = () => request(app.getHttpServer());
  const as = (tenant: Tenant, workspaceId = tenant.workspaceId) => ({
    get: (path: string) =>
      http().get(path).set('Cookie', tenant.cookie).set('X-Workspace-Id', workspaceId),
    post: (path: string) =>
      http().post(path).set('Cookie', tenant.cookie).set('X-Workspace-Id', workspaceId),
    patch: (path: string) =>
      http().patch(path).set('Cookie', tenant.cookie).set('X-Workspace-Id', workspaceId),
    delete: (path: string) =>
      http().delete(path).set('Cookie', tenant.cookie).set('X-Workspace-Id', workspaceId),
  });

  async function createTenant(label: string): Promise<Tenant> {
    const email = `iso-${label}-${suffix}@example.com`;
    const signUp = await http()
      .post('/api/auth/sign-up/email')
      .send({ name: `Iso ${label}`, email, password: 'password-12345' })
      .expect((res) => {
        if (res.status !== 200 && res.status !== 201) {
          throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
        }
      });
    const cookie = cookieHeader(signUp);

    const workspace = await http()
      .post('/workspaces')
      .set('Cookie', cookie)
      .send({ name: `Iso WS ${label} ${suffix}`, timezone: 'UTC', currency: 'USD', locale: 'en' })
      .expect(201);
    const workspaceId = workspace.body.id as string;
    const me = { cookie, workspaceId } as Tenant;

    const objects = await as(me).get('/objects').expect(200);
    const people = (objects.body as Array<{ id: string; apiName: string }>).find(
      (object) => object.apiName === 'people',
    );
    if (!people) throw new Error('people object missing');

    const record = await as(me)
      .post('/objects/people/records')
      .send({ name: `Secret person ${label}`, data: { email: `secret-${label}@example.com` } })
      .expect(201);

    const view = await as(me)
      .post('/objects/people/views')
      .send({ name: `View ${label}`, columns: ['name'], isShared: true })
      .expect(201);

    const webhook = await as(me)
      .post('/webhooks')
      .send({ url: 'http://127.0.0.1:9/hook', events: ['record.created'], objectId: people.id })
      .expect(201);

    const key = await as(me)
      .post('/api-keys')
      .send({ name: `Key ${label}`, scopes: { people: ['read'] } })
      .expect(201);

    const automation = await as(me)
      .post('/automations')
      .send({
        objectId: people.id,
        name: `Auto ${label}`,
        trigger: { type: 'record_created' },
        actions: [{ type: 'create_task', subject: 'Follow up on {{name}}' }],
      })
      .expect(201);

    const exportJob = await as(me)
      .post('/objects/people/exports')
      .send({ columns: ['name'] })
      .expect(201);

    const file = await as(me)
      .post(`/objects/people/records/${record.body.id}/files`)
      .send({
        name: 'secret.txt',
        mimeType: 'text/plain',
        data: Buffer.from(`secret ${label}`).toString('base64'),
      })
      .expect(201);

    const activity = await as(me)
      .post(`/objects/people/records/${record.body.id}/activities`)
      .send({ type: 'note', subject: `Private note ${label}` })
      .expect(201);

    return {
      ...me,
      peopleObjectId: people.id,
      recordId: record.body.id as string,
      viewId: view.body.id as string,
      webhookId: webhook.body.id as string,
      apiKeyId: key.body.id as string,
      apiKey: key.body.rawKey as string,
      automationId: automation.body.id as string,
      exportJobId: exportJob.body.id as string,
      fileId: file.body.id as string,
      activityId: activity.body.id as string,
    };
  }

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    a = await createTenant('a');
    b = await createTenant('b');
  });

  afterAll(async () => {
    await app?.close();
    await closeAppDb();
  });

  describe('using workspace A id with user B session', () => {
    it.each([
      ['records', '/objects/people/records'],
      ['views', '/objects/people/views'],
      ['webhooks', '/webhooks'],
      ['api keys', '/api-keys'],
      ['automations', '/automations'],
      ['roles', '/roles'],
      ['members', '/members'],
      ['invitations', '/invitations'],
      ['objects', '/objects'],
    ])('refuses to list %s', async (_name, path) => {
      const response = await as(b, a.workspaceId).get(path);
      expect(response.status).toBe(403);
    });

    it('refuses to create records in A', async () => {
      const response = await as(b, a.workspaceId)
        .post('/objects/people/records')
        .send({ name: 'Injected', data: {} });
      expect(response.status).toBe(403);
    });
  });

  describe('using workspace B with workspace A resource ids', () => {
    it('hides and protects records', async () => {
      await as(b).get(`/objects/people/records/${a.recordId}`).expect(404);
      await as(b)
        .patch(`/objects/people/records/${a.recordId}`)
        .send({ name: 'Hijacked' })
        .expect(404);
      await as(b).delete(`/objects/people/records/${a.recordId}`).expect(404);

      const own = await as(a).get(`/objects/people/records/${a.recordId}`).expect(200);
      expect(own.body.name).toBe('Secret person a');
    });

    it('does not apply bulk operations to records of another workspace', async () => {
      await as(b)
        .post('/objects/people/records/bulk-update')
        .send({ ids: [a.recordId], patch: { name: 'Hijacked' } });
      await as(b)
        .post('/objects/people/records/bulk-delete')
        .send({ ids: [a.recordId] });

      const own = await as(a).get(`/objects/people/records/${a.recordId}`).expect(200);
      expect(own.body.name).toBe('Secret person a');
    });

    it('does not leak A records through list, search or filters', async () => {
      const list = await as(b).get('/objects/people/records').expect(200);
      expect(JSON.stringify(list.body)).not.toContain('Secret person a');
      expect(JSON.stringify(list.body)).not.toContain('secret-a@example.com');

      const search = await as(b).get('/search').query({ q: 'Secret person' }).expect(200);
      expect(JSON.stringify(search.body)).not.toContain('Secret person a');
    });

    it('hides and protects views', async () => {
      await as(b).patch(`/objects/people/views/${a.viewId}`).send({ name: 'x' }).expect(404);
      await as(b).delete(`/objects/people/views/${a.viewId}`).expect(404);
      const list = await as(b).get('/objects/people/views').expect(200);
      expect(JSON.stringify(list.body)).not.toContain(a.viewId);
    });

    it('hides and protects webhooks and their deliveries', async () => {
      await as(b).patch(`/webhooks/${a.webhookId}`).send({ isActive: false }).expect(404);
      await as(b).delete(`/webhooks/${a.webhookId}`).expect(404);
      await as(b).get(`/webhooks/${a.webhookId}/deliveries`).expect(404);
      await as(b).post(`/webhooks/${a.webhookId}/deliveries/${a.webhookId}/resend`).expect(404);
      const list = await as(b).get('/webhooks').expect(200);
      expect(JSON.stringify(list.body)).not.toContain(a.webhookId);
    });

    it('hides and protects api keys', async () => {
      await as(b).delete(`/api-keys/${a.apiKeyId}`).expect(404);
      const list = await as(b).get('/api-keys').expect(200);
      expect(JSON.stringify(list.body)).not.toContain(a.apiKeyId);

      // A's key still works in A.
      await http()
        .get('/objects/people/records')
        .set('Authorization', `Bearer ${a.apiKey}`)
        .set('X-Workspace-Id', a.workspaceId)
        .expect(200);
    });

    it('hides and protects automations and their runs', async () => {
      await as(b).patch(`/automations/${a.automationId}`).send({ isActive: false }).expect(404);
      await as(b).delete(`/automations/${a.automationId}`).expect(404);
      await as(b).get(`/automations/${a.automationId}/runs`).expect(404);
      const list = await as(b).get('/automations').expect(200);
      expect(JSON.stringify(list.body)).not.toContain(a.automationId);
    });

    it('hides exports', async () => {
      await as(b).get(`/objects/people/exports/${a.exportJobId}`).expect(404);
      await as(b).get(`/objects/people/exports/${a.exportJobId}/download`).expect(404);
    });

    it('hides and protects files', async () => {
      await as(b).get(`/objects/people/records/${a.recordId}/files`).expect(404);
      await as(b).delete(`/objects/people/records/${a.recordId}/files/${a.fileId}`).expect(404);
      await as(b)
        .post(`/objects/people/records/${a.recordId}/files`)
        .send({ name: 'x.txt', mimeType: 'text/plain', data: Buffer.from('x').toString('base64') })
        .expect(404);

      const own = await as(a).get(`/objects/people/records/${a.recordId}/files`).expect(200);
      expect(own.body).toHaveLength(1);
    });

    it('hides and protects activities', async () => {
      await as(b).get(`/objects/people/records/${a.recordId}/activities`).expect(404);
      await as(b)
        .post(`/objects/people/records/${a.recordId}/activities`)
        .send({ type: 'note', subject: 'Injected' })
        .expect(404);
      await as(b)
        .patch(`/objects/people/records/${a.recordId}/activities/${a.activityId}`)
        .send({ subject: 'Hijacked' })
        .expect(404);

      const own = await as(a).get(`/objects/people/records/${a.recordId}/activities`).expect(200);
      expect(JSON.stringify(own.body)).toContain('Private note a');
      expect(JSON.stringify(own.body)).not.toContain('Injected');
    });

    it('does not expose A members, roles or invitations', async () => {
      const members = await as(b).get('/members').expect(200);
      expect(JSON.stringify(members.body)).not.toContain('iso-a-');
      const roles = await as(b).get('/roles').expect(200);
      const rolesA = await as(a).get('/roles').expect(200);
      const idsA = (rolesA.body as Array<{ id: string }>).map((role) => role.id);
      for (const role of roles.body as Array<{ id: string }>) {
        expect(idsA).not.toContain(role.id);
      }
    });
  });

  describe('api keys', () => {
    it("refuses A's key against workspace B", async () => {
      const response = await http()
        .get('/objects/people/records')
        .set('Authorization', `Bearer ${a.apiKey}`)
        .set('X-Workspace-Id', b.workspaceId);
      // The auth guard resolves the key within the requested workspace, so this is a 401.
      expect([401, 403]).toContain(response.status);
    });

    it('refuses a garbage key', async () => {
      const response = await http()
        .get('/objects/people/records')
        .set('Authorization', 'Bearer cfk_not-a-real-key')
        .set('X-Workspace-Id', a.workspaceId);
      expect([401, 403]).toContain(response.status);
    });
  });
});
