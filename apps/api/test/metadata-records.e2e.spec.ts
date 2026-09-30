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

describe('metadata and records', () => {
  let app: INestApplication;
  const suffix = Date.now();
  const password = 'password-12345';
  let ownerCookie = '';
  let workspaceId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();

    const owner = await signUp(app, {
      name: 'Meta Owner',
      email: `meta-owner-${suffix}@example.com`,
      password,
    });
    ownerCookie = owner.cookie;

    const workspaceResponse = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', ownerCookie)
      .send({
        name: `Meta WS ${suffix}`,
        timezone: 'UTC',
        currency: 'USD',
        locale: 'en',
      })
      .expect(201);
    workspaceId = workspaceResponse.body.id as string;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await closeAppDb();
  });

  it('seeds system objects and allows admin to CRUD custom Properties records', async () => {
    const objects = await request(app.getHttpServer())
      .get('/objects')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const apiNames = (objects.body as Array<{ apiName: string }>).map((row) => row.apiName).sort();
    expect(apiNames).toEqual(['companies', 'deals', 'people']);

    await request(app.getHttpServer())
      .post('/objects')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        apiName: 'properties',
        labelSingular: 'Property',
        labelPlural: 'Properties',
        icon: 'home',
      })
      .expect(201);

    const fieldSpecs = [
      { apiName: 'address', label: 'Address', type: 'text', required: true },
      { apiName: 'price', label: 'Price', type: 'currency' },
      { apiName: 'listed_on', label: 'Listed on', type: 'date' },
      { apiName: 'is_active', label: 'Active', type: 'boolean' },
      {
        apiName: 'status',
        label: 'Status',
        type: 'select',
        options: {
          choices: [
            { value: 'draft', label: 'Draft' },
            { value: 'listed', label: 'Listed' },
          ],
        },
      },
    ] as const;

    for (const field of fieldSpecs) {
      await request(app.getHttpServer())
        .post('/objects/properties/fields')
        .set('Cookie', ownerCookie)
        .set('X-Workspace-Id', workspaceId)
        .send(field)
        .expect(201);
    }

    const created = await request(app.getHttpServer())
      .post('/objects/properties/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: '123 Main St',
        data: {
          address: '123 Main St',
          price: { amount: 25000000, currency: 'USD' },
          listed_on: '2026-01-15',
          is_active: true,
          status: 'listed',
        },
      })
      .expect(201);

    expect(created.body.name).toBe('123 Main St');
    expect(created.body.data.status).toBe('listed');

    const invalid = await request(app.getHttpServer())
      .post('/objects/properties/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: 'Bad',
        data: {
          address: 'x',
          status: 'not-a-choice',
        },
      })
      .expect(400);
    expect(invalid.body.code).toBe('field_validation_error');
    expect(invalid.body.details.errors.length).toBeGreaterThan(0);

    const listed = await request(app.getHttpServer())
      .get('/objects/properties/records')
      .query({
        filter: JSON.stringify({
          and: [
            { field: 'status', op: 'eq', value: 'listed' },
            { field: 'price', op: 'gte', value: 1000 },
          ],
        }),
        sort: JSON.stringify({ field: 'name', direction: 'asc' }),
      })
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId);
    if (listed.status !== 200) {
      throw new Error(`list failed: ${listed.status} ${JSON.stringify(listed.body)}`);
    }
    expect(listed.body.items).toHaveLength(1);

    const recordId = created.body.id as string;
    await request(app.getHttpServer())
      .patch(`/objects/properties/records/${recordId}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ data: { status: 'draft' } })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/objects/properties/records/${recordId}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);
  });

  it('strips hidden fields from responses and rejects writes', async () => {
    const fields = await request(app.getHttpServer())
      .get('/objects/properties/fields')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const priceField = (fields.body as Array<{ id: string; apiName: string }>).find(
      (field) => field.apiName === 'price',
    );
    expect(priceField).toBeDefined();

    const roles = await request(app.getHttpServer())
      .get('/roles')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(200);
    const ownerRole = (roles.body as Array<{ id: string; key: string }>).find(
      (role) => role.key === 'owner',
    );

    await withWorkspace(workspaceId, async (tx) => {
      await tx.insert(roleFieldPermissions).values({
        workspaceId,
        roleId: ownerRole!.id,
        fieldId: priceField!.id,
        visibility: 'hidden',
      });
    });

    const created = await request(app.getHttpServer())
      .post('/objects/properties/records')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: 'Hidden price property',
        data: {
          address: '9 Hidden Ave',
          price: { amount: 1, currency: 'USD' },
          listed_on: '2026-02-01',
          is_active: true,
          status: 'draft',
        },
      })
      .expect(201);

    expect(created.body.data.price).toBeUndefined();
    expect(created.body.data.address).toBe('9 Hidden Ave');

    const rejected = await request(app.getHttpServer())
      .patch(`/objects/properties/records/${created.body.id}`)
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({ data: { price: { amount: 2, currency: 'USD' } } })
      .expect(400);
    expect(rejected.body.code).toBe('field_validation_error');
  });

  it('allows recreating a field with the same api name after soft delete', async () => {
    await request(app.getHttpServer())
      .post('/objects/properties/fields')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        apiName: 'reuse_me',
        label: 'Reuse me',
        type: 'text',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete('/objects/properties/fields/reuse_me')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(204);

    const recreated = await request(app.getHttpServer())
      .post('/objects/properties/fields')
      .set('Cookie', ownerCookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        apiName: 'reuse_me',
        label: 'Reuse me again',
        type: 'text',
      })
      .expect(201);

    expect(recreated.body.apiName).toBe('reuse_me');
    expect(recreated.body.label).toBe('Reuse me again');
    expect(recreated.body.deletedAt).toBeNull();
  });
});
