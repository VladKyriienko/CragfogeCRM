import { type INestApplication } from '@nestjs/common';
import { closeAppDb } from '@cragfoge/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/create-app';

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('phase 8 industry templates', () => {
  let app: INestApplication;
  const suffix = Date.now();
  const password = 'password-12345';

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await closeAppDb();
  });

  it('creates a real-estate workspace with objects, pipeline view, automations, and sample data', async () => {
    const signUp = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({
        name: 'RE Owner',
        email: `re-owner-${suffix}@example.com`,
        password,
      })
      .expect((res) => {
        if (res.status !== 200 && res.status !== 201) {
          throw new Error(`sign-up failed: ${res.status}`);
        }
      });
    const cookie = cookieHeader(signUp);

    const workspaceResponse = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', cookie)
      .send({
        name: `Real Estate ${suffix}`,
        timezone: 'UTC',
        currency: 'USD',
        locale: 'en',
        templateId: 'real-estate',
        includeSampleData: true,
      });
    expect([200, 201]).toContain(workspaceResponse.status);
    const workspaceId = workspaceResponse.body.id as string;

    const objects = await request(app.getHttpServer())
      .get('/objects')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const apiNames = (objects.body as Array<{ apiName: string }>).map((row) => row.apiName).sort();
    expect(apiNames).toEqual(['deals', 'people', 'properties']);

    const fields = await request(app.getHttpServer())
      .get('/objects/deals/fields')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((fields.body as Array<{ apiName: string }>).some((f) => f.apiName === 'stage')).toBe(
      true,
    );

    const views = await request(app.getHttpServer())
      .get('/objects/deals/views')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((views.body as Array<{ name: string }>).some((v) => v.name === 'Listing pipeline')).toBe(
      true,
    );

    const automations = await request(app.getHttpServer())
      .get('/automations')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((automations.body as unknown[]).length).toBeGreaterThanOrEqual(1);

    const people = await request(app.getHttpServer())
      .get('/objects/people/records')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    expect((people.body as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(1);

    const checklist = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/onboarding`)
      .set('Cookie', cookie)
      .expect(200);
    expect(checklist.body.steps).toBeDefined();
  }, 60_000);
});
