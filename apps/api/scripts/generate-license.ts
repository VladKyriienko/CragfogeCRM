#!/usr/bin/env bun
/**
 * Generate a signed self-host license. Private key must be provided via env —
 * never commit LICENSE_PRIVATE_KEY.
 *
 * Usage:
 *   LICENSE_PRIVATE_KEY=<pkcs8-der-base64> bun scripts/generate-license.ts \
 *     --licensee "Acme Inc" --seats 10 --expires 2027-12-31
 */
import { parseArgs } from 'node:util';
import { DEV_LICENSE_PRIVATE_KEY, signLicensePayload } from '../src/billing/license-crypto';

const { values } = parseArgs({
  options: {
    licensee: { type: 'string' },
    seats: { type: 'string' },
    expires: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.licensee || !values.seats || !values.expires) {
  console.log(`Usage:
  LICENSE_PRIVATE_KEY=<base64> bun scripts/generate-license.ts \\
    --licensee "Acme Inc" --seats 10 --expires 2027-12-31

In development only, omit LICENSE_PRIVATE_KEY to use the committed test key.`);
  process.exit(values.help ? 0 : 1);
}

const seats = Number.parseInt(values.seats, 10);
if (!Number.isFinite(seats) || seats < 1) {
  console.error('--seats must be a positive integer');
  process.exit(1);
}

const expiresDate = new Date(`${values.expires}T23:59:59.000Z`);
if (Number.isNaN(expiresDate.getTime())) {
  console.error('--expires must be YYYY-MM-DD');
  process.exit(1);
}

const privateKey = process.env.LICENSE_PRIVATE_KEY ?? DEV_LICENSE_PRIVATE_KEY;
if (!process.env.LICENSE_PRIVATE_KEY && process.env.NODE_ENV === 'production') {
  console.error('LICENSE_PRIVATE_KEY is required in production');
  process.exit(1);
}

const issuedAt = new Date();
const licenseKey = signLicensePayload(
  {
    licensee: values.licensee,
    seats,
    expires_at: expiresDate.toISOString(),
    issued_at: issuedAt.toISOString(),
  },
  privateKey,
);

console.log(licenseKey);
