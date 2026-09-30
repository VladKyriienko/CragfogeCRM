import { type INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { healthResponseSchema } from '@cragfoge/shared';
import { createApp } from '../src/create-app';
import { closeAppDb } from '@cragfoge/db';

describe('GET /health', () => {
  let app: INestApplication;

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

  it('returns ok when Postgres and Redis are reachable', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    const body = healthResponseSchema.parse(response.body);
    expect(body).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });
  });

  it('serves the OpenAPI document', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(response.body.paths['/health']).toBeDefined();
  });
});
