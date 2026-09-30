import { z } from 'zod';

export const deploymentModeSchema = z.enum(['cloud', 'selfhost']);
export type DeploymentMode = z.infer<typeof deploymentModeSchema>;

export const billingStatusSchema = z.enum(['none', 'trialing', 'active', 'past_due', 'canceled']);
export type BillingStatus = z.infer<typeof billingStatusSchema>;

export const entitlementActionSchema = z.enum(['invite_member']);
export type EntitlementAction = z.infer<typeof entitlementActionSchema>;

export const licensePayloadSchema = z.object({
  licensee: z.string().min(1).max(200),
  seats: z.number().int().positive().max(10_000),
  expires_at: z.string().datetime(),
  issued_at: z.string().datetime(),
});
export type LicensePayload = z.infer<typeof licensePayloadSchema>;

export const activateLicenseBodySchema = z.object({
  licenseKey: z.string().trim().min(1).max(8_192),
});
export type ActivateLicenseBody = z.infer<typeof activateLicenseBodySchema>;

export const entitlementsSchema = z.object({
  deploymentMode: deploymentModeSchema,
  billingStatus: billingStatusSchema,
  plan: z.string(),
  seatLimit: z.number().int().nonnegative().nullable(),
  seatsUsed: z.number().int().nonnegative(),
  isReadOnly: z.boolean(),
  canInviteMember: z.boolean(),
  trialEndsAt: z.string().datetime().nullable(),
  pastDueSince: z.string().datetime().nullable(),
  /** True when past_due but still inside the 7-day grace window. */
  pastDueGraceActive: z.boolean(),
  /** Self-host: valid activated license present and not expired. */
  hasValidLicense: z.boolean(),
  licensee: z.string().nullable(),
  licenseExpiresAt: z.string().datetime().nullable(),
  overSeatLimit: z.boolean(),
});
export type EntitlementsDto = z.infer<typeof entitlementsSchema>;

export const checkoutSessionSchema = z.object({
  url: z.string().url(),
});
export type CheckoutSessionDto = z.infer<typeof checkoutSessionSchema>;

export const portalSessionSchema = z.object({
  url: z.string().url(),
});
export type PortalSessionDto = z.infer<typeof portalSessionSchema>;

export const activatedLicenseSchema = z.object({
  licensee: z.string(),
  seats: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  issuedAt: z.string().datetime(),
});
export type ActivatedLicenseDto = z.infer<typeof activatedLicenseSchema>;
