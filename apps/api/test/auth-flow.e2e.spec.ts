import { type INestApplication } from '@nestjs/common';
import { closeAppDb } from '@cragfoge/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/create-app';

type AuthBody = {
  user?: { id: string; email: string; name: string };
  token?: string;
};

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  if (!raw) {
    return '';
  }
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

async function signIn(app: INestApplication, input: { email: string; password: string }) {
  const response = await request(app.getHttpServer())
    .post('/api/auth/sign-in/email')
    .send(input)
    .expect(200);
  return { body: response.body as AuthBody, cookie: cookieHeader(response) };
}

describe('auth and invite flow', () => {
  let app: INestApplication;
  const suffix = Date.now();
  const ownerEmail = `owner-${suffix}@example.com`;
  const memberEmail = `member-${suffix}@example.com`;
  const password = 'password-12345';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeAppDb();
  });

  it('signs up, creates a workspace, invites a member who sees only that workspace', async () => {
    const owner = await signUp(app, {
      name: 'Owner User',
      email: ownerEmail,
      password,
    });
    expect(owner.cookie).toContain('session');

    const workspaceResponse = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', owner.cookie)
      .send({
        name: `Acme ${suffix}`,
        timezone: 'UTC',
        currency: 'USD',
        locale: 'en',
      })
      .expect(201);
    const workspaceId = workspaceResponse.body.id as string;
    expect(workspaceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const rolesResponse = await request(app.getHttpServer())
      .get('/roles')
      .set('Cookie', owner.cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const memberRole = (rolesResponse.body as Array<{ id: string; key: string }>).find(
      (role) => role.key === 'member',
    );
    expect(memberRole).toBeDefined();

    const inviteResponse = await request(app.getHttpServer())
      .post('/invitations')
      .set('Cookie', owner.cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ email: memberEmail, roleId: memberRole!.id })
      .expect(201);
    const inviteToken = (inviteResponse.body as { token?: string }).token;
    expect(inviteToken).toBeTruthy();

    const member = await signUp(app, {
      name: 'Member User',
      email: memberEmail,
      password,
    });

    await request(app.getHttpServer())
      .post('/invitations/accept')
      .set('Cookie', member.cookie)
      .send({ token: inviteToken })
      .expect(201);

    const memberWorkspaces = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Cookie', member.cookie)
      .expect(200);

    expect(memberWorkspaces.body).toHaveLength(1);
    expect(memberWorkspaces.body[0].id).toBe(workspaceId);
  });

  it('returns 403 when a Member hits an admin-only endpoint', async () => {
    const owner = await signIn(app, { email: ownerEmail, password });
    const workspaces = await request(app.getHttpServer())
      .get('/workspaces')
      .set('Cookie', owner.cookie)
      .expect(200);
    const workspaceId = workspaces.body[0].id as string;

    const member = await signIn(app, { email: memberEmail, password });
    await request(app.getHttpServer())
      .get('/members')
      .set('Cookie', member.cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(403);

    await request(app.getHttpServer())
      .post('/invitations')
      .set('Cookie', member.cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        email: `other-${suffix}@example.com`,
        roleId: '00000000-0000-4000-8000-000000000099',
      })
      .expect(403);
  });
});
