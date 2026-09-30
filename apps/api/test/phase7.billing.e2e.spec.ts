import { type INestApplication } from '@nestjs/common';
import { closeAppDb, getAppDb, instanceLicense } from '@cragfoge/db';
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

describe('Phase 7 billing (selfhost)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DEPLOYMENT_MODE = 'selfhost';
    await getAppDb().delete(instanceLicense);
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await closeAppDb();
  });

  it('returns entitlements and rejects Stripe checkout in selfhost', async () => {
    const suffix = Date.now();
    const owner = await signUp(app, {
      name: 'Billing Owner',
      email: `billing-owner-${suffix}@example.com`,
      password: 'password-password',
    });

    const workspace = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', owner.cookie)
      .send({ name: `Billing WS ${suffix}` })
      .expect(201);

    const workspaceId = workspace.body.id as string;

    const entitlements = await request(app.getHttpServer())
      .get('/billing/entitlements')
      .set('Cookie', owner.cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);

    expect(entitlements.body.deploymentMode).toBe('selfhost');
    expect(entitlements.body.seatLimit).toBe(3);
    expect(entitlements.body.hasValidLicense).toBe(false);

    await request(app.getHttpServer())
      .post('/billing/checkout')
      .set('Cookie', owner.cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({})
      .expect(503);
  });

  it('blocks invites at the free seat limit', async () => {
    const suffix = Date.now();
    const owner = await signUp(app, {
      name: 'Seat Owner',
      email: `seat-owner-${suffix}@example.com`,
      password: 'password-password',
    });

    const workspace = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', owner.cookie)
      .send({ name: `Seat WS ${suffix}` })
      .expect(201);
    const workspaceId = workspace.body.id as string;

    const roles = await request(app.getHttpServer())
      .get('/roles')
      .set('Cookie', owner.cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const memberRole = (roles.body as { id: string; key: string }[]).find((r) => r.key === 'member');
    expect(memberRole).toBeTruthy();

    for (let i = 0; i < 2; i += 1) {
      const invitee = await signUp(app, {
        name: `Seat Member ${i}`,
        email: `seat-member-${suffix}-${i}@example.com`,
        password: 'password-password',
      });
      const invite = await request(app.getHttpServer())
        .post('/invitations')
        .set('Cookie', owner.cookie)
        .set('X-Workspace-Id', workspaceId)
        .send({ email: invitee.body.user!.email, roleId: memberRole!.id })
        .expect(201);
      const token = (invite.body as { token?: string }).token;
      expect(token).toBeTruthy();
      await request(app.getHttpServer())
        .post('/invitations/accept')
        .set('Cookie', invitee.cookie)
        .send({ token })
        .expect(201);
    }

    const blocked = await request(app.getHttpServer())
      .post('/invitations')
      .set('Cookie', owner.cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ email: `blocked-${suffix}@example.com`, roleId: memberRole!.id })
      .expect(403);

    expect(JSON.stringify(blocked.body)).toMatch(/seat|read-only/i);
  });
});
