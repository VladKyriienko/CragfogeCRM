import { createHmac, timingSafeEqual } from 'node:crypto';

export function signWebhookPayload(secret: string, body: string): string {
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(secret: string, body: string, header: string): boolean {
  const expected = signWebhookPayload(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
