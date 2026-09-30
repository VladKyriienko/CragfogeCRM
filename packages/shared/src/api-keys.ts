import { z } from 'zod';

export const apiKeyScopeActionSchema = z.enum(['read', 'write']);
export type ApiKeyScopeAction = z.infer<typeof apiKeyScopeActionSchema>;

export const apiKeyScopesSchema = z.record(z.array(apiKeyScopeActionSchema).min(1));
export type ApiKeyScopes = z.infer<typeof apiKeyScopesSchema>;

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: apiKeyScopesSchema,
});
export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: apiKeyScopesSchema,
  lastUsedAt: z.coerce.date().nullable(),
  revokedAt: z.coerce.date().nullable(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
});
export type ApiKeyDto = z.infer<typeof apiKeySchema>;

/** Returned only once on create. */
export const createdApiKeySchema = apiKeySchema.extend({
  rawKey: z.string().min(1),
});
export type CreatedApiKeyDto = z.infer<typeof createdApiKeySchema>;
