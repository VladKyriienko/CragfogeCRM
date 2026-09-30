import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { desc, instanceLicense, type AppDatabase } from '@cragfoge/db';
import {
  activateLicenseBodySchema,
  activatedLicenseSchema,
  type ActivateLicenseBody,
  type ActivatedLicenseDto,
  type LicensePayload,
} from '@cragfoge/shared';
import type { Env } from '../config/env';
import { APP_DB, ENV } from '../tokens';
import {
  FREE_MODE_SEAT_LIMIT,
  LicenseVerificationError,
  verifyLicenseKey,
} from './license-crypto';

export type ResolvedLicense = {
  valid: boolean;
  seats: number;
  licensee: string | null;
  expiresAt: Date | null;
  issuedAt: Date | null;
};

@Injectable()
export class LicenseService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(ENV) private readonly env: Env,
  ) {}

  verify(licenseKey: string): LicensePayload {
    try {
      return verifyLicenseKey(licenseKey, this.env.LICENSE_PUBLIC_KEY);
    } catch (error) {
      if (error instanceof LicenseVerificationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async activate(body: ActivateLicenseBody): Promise<ActivatedLicenseDto> {
    const input = activateLicenseBodySchema.parse(body);
    const payload = this.verify(input.licenseKey);

    await this.db.delete(instanceLicense);
    const [row] = await this.db
      .insert(instanceLicense)
      .values({
        payload: input.licenseKey.trim(),
        licensee: payload.licensee,
        seats: payload.seats,
        expiresAt: new Date(payload.expires_at),
        issuedAt: new Date(payload.issued_at),
      })
      .returning();
    if (!row) {
      throw new BadRequestException('Could not activate license');
    }

    return activatedLicenseSchema.parse({
      licensee: row.licensee,
      seats: row.seats,
      expiresAt: row.expiresAt.toISOString(),
      issuedAt: row.issuedAt.toISOString(),
    });
  }

  async getActive(): Promise<ResolvedLicense> {
    const [row] = await this.db
      .select()
      .from(instanceLicense)
      .orderBy(desc(instanceLicense.activatedAt))
      .limit(1);

    if (!row) {
      return {
        valid: false,
        seats: FREE_MODE_SEAT_LIMIT,
        licensee: null,
        expiresAt: null,
        issuedAt: null,
      };
    }

    try {
      verifyLicenseKey(row.payload, this.env.LICENSE_PUBLIC_KEY);
    } catch {
      return {
        valid: false,
        seats: FREE_MODE_SEAT_LIMIT,
        licensee: row.licensee,
        expiresAt: row.expiresAt,
        issuedAt: row.issuedAt,
      };
    }

    if (row.expiresAt.getTime() < Date.now()) {
      return {
        valid: false,
        seats: FREE_MODE_SEAT_LIMIT,
        licensee: row.licensee,
        expiresAt: row.expiresAt,
        issuedAt: row.issuedAt,
      };
    }

    return {
      valid: true,
      seats: row.seats,
      licensee: row.licensee,
      expiresAt: row.expiresAt,
      issuedAt: row.issuedAt,
    };
  }

  async clearForTests(): Promise<void> {
    await this.db.delete(instanceLicense);
  }
}
