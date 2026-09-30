import { describe, expect, it } from 'vitest';
import { DEV_LICENSE_PUBLIC_KEY } from '../config/env';
import {
  DEV_LICENSE_PRIVATE_KEY,
  FREE_MODE_SEAT_LIMIT,
  LicenseVerificationError,
  signLicensePayload,
  verifyLicenseKey,
} from './license-crypto';

function futureLicense(overrides: { seats?: number; expires_at?: string } = {}) {
  const issued = new Date();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return signLicensePayload(
    {
      licensee: 'Acme Test',
      seats: overrides.seats ?? 10,
      expires_at: overrides.expires_at ?? expires.toISOString(),
      issued_at: issued.toISOString(),
    },
    DEV_LICENSE_PRIVATE_KEY,
  );
}

describe('license crypto', () => {
  it('verifies a valid license', () => {
    const key = futureLicense({ seats: 5 });
    const payload = verifyLicenseKey(key, DEV_LICENSE_PUBLIC_KEY);
    expect(payload.licensee).toBe('Acme Test');
    expect(payload.seats).toBe(5);
  });

  it('rejects an expired license', () => {
    const key = futureLicense({
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(() => verifyLicenseKey(key, DEV_LICENSE_PUBLIC_KEY)).toThrow(LicenseVerificationError);
    expect(() => verifyLicenseKey(key, DEV_LICENSE_PUBLIC_KEY)).toThrow(/expired/i);
  });

  it('rejects a tampered signature', () => {
    const key = futureLicense();
    const [payloadPart, sigPart] = key.split('.');
    const tampered = `${payloadPart}.${sigPart!.slice(0, -4)}aaaa`;
    expect(() => verifyLicenseKey(tampered, DEV_LICENSE_PUBLIC_KEY)).toThrow(
      /signature|encoding|format/i,
    );
  });

  it('rejects a tampered payload with valid-looking structure', () => {
    const key = futureLicense({ seats: 5 });
    const [, sig] = key.split('.');
    const evilPayload = Buffer.from(
      JSON.stringify({
        licensee: 'Evil',
        seats: 999,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        issued_at: new Date().toISOString(),
      }),
      'utf8',
    ).toString('base64url');
    expect(() => verifyLicenseKey(`${evilPayload}.${sig}`, DEV_LICENSE_PUBLIC_KEY)).toThrow(
      /signature/i,
    );
  });

  it('documents free-mode seat limit', () => {
    expect(FREE_MODE_SEAT_LIMIT).toBe(3);
  });
});
