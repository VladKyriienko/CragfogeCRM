import { describe, expect, it } from 'vitest';
import { healthResponseSchema, workspaceIdSchema } from './index';

describe('shared schemas', () => {
  it('parses a healthy API response', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });

    expect(parsed.status).toBe('ok');
  });

  it('rejects a response without checks', () => {
    const result = healthResponseSchema.safeParse({ status: 'ok' });
    expect(result.success).toBe(false);
  });

  it('accepts a workspace id and rejects other strings', () => {
    expect(workspaceIdSchema.safeParse('6b1f3a4e-8c2d-4e1a-9f0b-1a2b3c4d5e6f').success).toBe(true);
    expect(workspaceIdSchema.safeParse('workspace-a').success).toBe(false);
  });
});
