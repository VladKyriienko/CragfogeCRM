import { type INestApplication } from '@nestjs/common';
import { auditLogs, closeAppDb, eq, openDatabase, records, withWorkspace } from '@cragfoge/db';
import { gdprEraseResultSchema, gdprExportSchema } from '@cragfoge/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/create-app';

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'];
  if (!raw) return '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('phase 8 GDPR export/erase', () => {
  let app: INestApplication;
  const suffix = Date.now();
  const password = 'password-12345';
  let cookie = '';
  let workspaceId = '';
  let personId = '';

  beforeAll(async () => {
    app = await createApp();
    await app.init();

    const signUp = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({
        name: 'Gdpr Owner',
        email: `gdpr-owner-${suffix}@example.com`,
        password,
      })
      .expect((res) => {
        if (res.status !== 200 && res.status !== 201) {
          throw new Error(`sign-up failed: ${res.status}`);
        }
      });
    cookie = cookieHeader(signUp);

    const workspaceResponse = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Cookie', cookie)
      .send({
        name: `GDPR WS ${suffix}`,
        timezone: 'UTC',
        currency: 'USD',
        locale: 'en',
        templateId: 'generic-sales',
      });
    expect([200, 201]).toContain(workspaceResponse.status);
    workspaceId = workspaceResponse.body.id as string;

    const person = await request(app.getHttpServer())
      .post('/objects/people/records')
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .send({
        name: 'Private Person',
        data: { email: 'private@example.com', phone: '+1-555-0001' },
      });
    expect([200, 201]).toContain(person.status);
    personId = person.body.id as string;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    await closeAppDb();
  });

  it('exports person JSON and hard-deletes with audit redaction', async () => {
    const exported = await request(app.getHttpServer())
      .post(`/objects/people/records/${personId}/gdpr-export`)
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(201);
    const bundle = gdprExportSchema.parse(exported.body);
    expect(bundle.record.id).toBe(personId);
    expect(bundle.record.data.email).toBe('private@example.com');

    const erased = await request(app.getHttpServer())
      .post(`/objects/people/records/${personId}/gdpr-erase`)
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(201);
    const result = gdprEraseResultSchema.parse(erased.body);
    expect(result.deletedRecordId).toBe(personId);

    await request(app.getHttpServer())
      .get(`/objects/people/records/${personId}`)
      .set('Cookie', cookie)
      .set('X-Workspace-Id', workspaceId)
      .expect(404);

    const remaining = await withWorkspace(workspaceId, (tx) =>
      tx.select({ id: records.id }).from(records).where(eq(records.id, personId)),
    );
    expect(remaining).toHaveLength(0);

    const migrator = openDatabase(
      process.env.DATABASE_URL_MIGRATOR ??
        'postgresql://crm_migrator:crm_migrator@localhost:5432/crm',
    );
    try {
      const audits = await migrator.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, personId));
      for (const row of audits) {
        if (row.action === 'gdpr.erase') continue;
        expect(row.diff).toMatchObject({ redacted: true, reason: 'gdpr_erase' });
      }
    } finally {
      await migrator.close();
    }
  }, 60_000);
});
