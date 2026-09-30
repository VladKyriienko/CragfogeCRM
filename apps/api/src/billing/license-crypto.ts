import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { licensePayloadSchema, type LicensePayload } from '@cragfoge/shared';

export const FREE_MODE_SEAT_LIMIT = 3;
export const CLOUD_TRIAL_SEAT_LIMIT = 20;
export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export class LicenseVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseVerificationError';
  }
}

function decodePart(part: string): Buffer {
  return Buffer.from(part, 'base64url');
}

/**
 * License blob: `base64url(json).base64url(ed25519_signature)`.
 * Public key is SPKI DER encoded as standard base64 (env `LICENSE_PUBLIC_KEY`).
 */
export function verifyLicenseKey(licenseKey: string, publicKeyBase64: string): LicensePayload {
  const trimmed = licenseKey.trim();
  const dot = trimmed.indexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) {
    throw new LicenseVerificationError('Invalid license format');
  }
  const payloadB64 = trimmed.slice(0, dot);
  const sigB64 = trimmed.slice(dot + 1);
  let payloadBytes: Buffer;
  let signature: Buffer;
  try {
    payloadBytes = decodePart(payloadB64);
    signature = decodePart(sigB64);
  } catch {
    throw new LicenseVerificationError('Invalid license encoding');
  }

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    throw new LicenseVerificationError('Invalid LICENSE_PUBLIC_KEY');
  }

  const ok = verify(null, payloadBytes, publicKey, signature);
  if (!ok) {
    throw new LicenseVerificationError('Tampered or invalid license signature');
  }

  let json: unknown;
  try {
    json = JSON.parse(payloadBytes.toString('utf8')) as unknown;
  } catch {
    throw new LicenseVerificationError('Invalid license payload JSON');
  }

  const parsed = licensePayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new LicenseVerificationError('Invalid license payload fields');
  }

  const expiresAt = Date.parse(parsed.data.expires_at);
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    throw new LicenseVerificationError('License expired');
  }

  return parsed.data;
}

export function signLicensePayload(payload: LicensePayload, privateKeyBase64: string): string {
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, payloadBytes, privateKey);
  return `${payloadBytes.toString('base64url')}.${signature.toString('base64url')}`;
}

/** Matching private key for {@link DEV_LICENSE_PUBLIC_KEY} — tests/CLI only. */
export const DEV_LICENSE_PRIVATE_KEY =
  'MC4CAQAwBQYDK2VwBCIEIJjvKK0P+irc/8+JPeNlMFEmj9CXOUavjm2Uti5EAXMf';
