import { Writable } from 'node:stream';
import express from 'express';
import pinoHttp from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS, LOG_SERIALIZERS } from './logging';

describe('request logging', () => {
  it('keeps credentials, session cookies and query tokens out of the log', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const app = express();
    app.use(
      pinoHttp({ level: 'info', redact: LOG_REDACT_PATHS, serializers: LOG_SERIALIZERS }, stream),
    );
    app.get('/verify', (_req, res) => {
      res.setHeader('Set-Cookie', 'better-auth.session_token=SESSION-SECRET; HttpOnly');
      res.json({ ok: true });
    });

    await request(app)
      .get('/verify?token=VERIFY-TOKEN-SECRET')
      .set('Authorization', 'Bearer cfk_API-KEY-SECRET')
      .set('Cookie', 'better-auth.session_token=COOKIE-SECRET')
      .set('X-Api-Key', 'HEADER-KEY-SECRET')
      .expect(200);

    const output = lines.join('');
    expect(output).toContain('/verify');
    for (const secret of [
      'VERIFY-TOKEN-SECRET',
      'cfk_API-KEY-SECRET',
      'COOKIE-SECRET',
      'HEADER-KEY-SECRET',
      'SESSION-SECRET',
    ]) {
      expect(output, `${secret} leaked into logs`).not.toContain(secret);
    }
  });
});
