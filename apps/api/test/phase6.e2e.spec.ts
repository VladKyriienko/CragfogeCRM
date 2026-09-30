import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { closeAppDb } from '@cragfoge/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/create-app';
import { AutomationLoopService } from '../src/automations/automation-loop.service';

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

async function startCaptureServer(): Promise<{
  url: string;
  payloads: unknown[];
  close: () => Promise<void>;
}> {
  const payloads: unknown[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        payloads.push(JSON.parse(raw) as unknown);
      } catch {
        payloads.push(raw);
      }
      res.statusCode = 200;
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind capture server');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    payloads,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe('phase 6: api keys, webhooks, automations', () => {
  let app: INestApplication;
  const suffix = Date.now();
  const password = 'password-12345';
  const ownerEmail = `p6-owner-${suffix}@example.com`;
  let ownerCookie = '';
  let ownerId = '';
  let workspaceId = '';
  let dealsObjectId = '';
  let capture: Awaited<ReturnType<typeof startCaptureServer>>;

  beforeAll(async () => {
    AutomationLoopService.resetTestCounters();
    capture = await startCaptureServer();
    app = await createApp();
    await app.init();

    const owner = await signUp(app, { name: 'P6 Owner', email: ownerEmail, password });
    ownerCookie = owner.cookie;
    ownerId = owner.body.user!.id;

    const workspaceResponse = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', ownerCookie)
      .send({ name: `P6 WS ${suffix}`, timezone: 'UTC', currency: 'USD', locale: 'en' })
      .expect(201);
    workspaceId = workspaceResponse.body.id as string;

    const objectsResponse = await request(app.getHttpServer())
      .get('/objects')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const deals = (objectsResponse.body as Array<{ id: string; apiName: string }>).find(
      (object) => object.apiName === 'deals',
    );
    if (!deals) {
      throw new Error('deals object missing from seed');
    }
    dealsObjectId = deals.id;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await capture.close();
    await closeAppDb();
  });

  it('read-only API key allows GET and returns 403 on writes', async () => {
    const created = await request(app.getHttpServer())
      .post('/api-keys')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Readonly', scopes: { deals: ['read'] } })
      .expect(201);

    const rawKey = created.body.rawKey as string;
    expect(rawKey.startsWith('cfk_')).toBe(true);

    await request(app.getHttpServer())
      .get('/objects/deals/records')
      .set('Authorization', `Bearer ${rawKey}`)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    await request(app.getHttpServer())
      .post('/objects/deals/records')
      .set('Authorization', `Bearer ${rawKey}`)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: 'Should fail', data: { stage: 'lead' } })
      .expect(403);
  });

  it('failing webhook is retried then auto-disabled with delivery log', async () => {
    const created = await request(app.getHttpServer())
      .post('/webhooks')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        url: 'http://127.0.0.1:9/fail',
        events: ['record.created'],
        objectId: dealsObjectId,
      })
      .expect(201);

    const subscriptionId = created.body.id as string;
    expect(created.body.signingSecret).toBeTruthy();

    await request(app.getHttpServer())
      .post('/objects/deals/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: `Fail Hook Deal ${suffix}`, data: { stage: 'lead' } })
      .expect(201);

    const subscription = await request(app.getHttpServer())
      .get('/webhooks')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    const failedSub = (subscription.body as Array<{ id: string; isActive: boolean }>).find(
      (row) => row.id === subscriptionId,
    );
    expect(failedSub?.isActive).toBe(false);

    const deliveries = await request(app.getHttpServer())
      .get(`/webhooks/${subscriptionId}/deliveries`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(deliveries.body.length).toBeGreaterThan(0);
    expect(deliveries.body[0].status).toBe('failed');
    expect(deliveries.body[0].attemptCount).toBe(8);
  });

  it('Deal stage Won creates owner task and delivers webhook', async () => {
    const webhook = await request(app.getHttpServer())
      .post('/webhooks')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        url: capture.url,
        events: ['record.updated', 'record.stage_changed', 'activity.created'],
        objectId: dealsObjectId,
      })
      .expect(201);

    const automation = await request(app.getHttpServer())
      .post('/automations')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        objectId: dealsObjectId,
        name: 'Won follow-up',
        trigger: { type: 'stage_changed', to: 'won' },
        actions: [
          { type: 'create_task', subject: 'Follow up on {{name}}' },
          { type: 'call_webhook', subscriptionId: webhook.body.id },
        ],
      })
      .expect(201);

    const deal = await request(app.getHttpServer())
      .post('/objects/deals/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ name: `Won Deal ${suffix}`, data: { stage: 'lead' } })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/objects/deals/records/${deal.body.id}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ data: { stage: 'won' } })
      .expect(200);

    const activities = await request(app.getHttpServer())
      .get(`/objects/deals/records/${deal.body.id}/activities`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(activities.body.length).toBeGreaterThan(0);
    expect(activities.body[0].subject).toContain(`Won Deal ${suffix}`);
    expect(activities.body[0].ownerId).toBe(ownerId);
    expect(activities.body[0].type).toBe('task');

    const runs = await request(app.getHttpServer())
      .get(`/automations/${automation.body.id}/runs`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(runs.body.length).toBeGreaterThan(0);
    expect(runs.body[0].status).toBe('succeeded');

    // Wait briefly for inline webhook delivery from automation + domain events.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(capture.payloads.length).toBeGreaterThan(0);

    const deliveries = await request(app.getHttpServer())
      .get(`/webhooks/${webhook.body.id}/deliveries`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect(
      (deliveries.body as Array<{ status: string }>).some((row) => row.status === 'succeeded'),
    ).toBe(true);
  });

  it('serves public OpenAPI at /docs/public', async () => {
    const response = await request(app.getHttpServer()).get('/docs/public-json').expect(200);
    expect(response.body.paths).toBeDefined();
    expect(Object.keys(response.body.paths as object).some((path) => path.includes('/records'))).toBe(
      true,
    );
  });
});
