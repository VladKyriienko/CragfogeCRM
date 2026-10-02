import { type INestApplication } from '@nestjs/common';
import { closeAppDb } from '@cragfoge/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/create-app';

describe('HTTP security headers', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await closeAppDb();
  });

  it.each(['/health', '/api/auth/get-session', '/objects/people/records'])(
    'sends hardening headers on %s',
    async (path) => {
      const response = await request(app.getHttpServer()).get(path);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['referrer-policy']).toBeDefined();
    },
  );

  it('keeps Swagger UI usable by not applying the API CSP to /docs', async () => {
    const response = await request(app.getHttpServer()).get('/docs');
    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('only allows the configured web origin through CORS', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example');
    // The header is pinned to the configured origin, never reflected, so browsers block evil.example.
    expect(denied.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});
