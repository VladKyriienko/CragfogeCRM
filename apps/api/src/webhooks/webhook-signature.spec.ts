import { describe, expect, it } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from './webhook-signature';

describe('webhook signature', () => {
  it('signs and verifies HMAC-SHA256 payloads', () => {
    const secret = 'test-secret';
    const body = JSON.stringify({ hello: 'world' });
    const signature = signWebhookPayload(secret, body);
    expect(signature.startsWith('sha256=')).toBe(true);
    expect(verifyWebhookSignature(secret, body, signature)).toBe(true);
    expect(verifyWebhookSignature(secret, body, 'sha256=deadbeef')).toBe(false);
  });
});
