import { createHash, randomBytes } from 'node:crypto';
import type { ApiKeyScopes } from '@cragfoge/shared';
import type { ResolvedPermission } from '../common/request-context';

const KEY_PREFIX_BYTES = 4;
const KEY_SECRET_BYTES = 24;

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const prefix = randomBytes(KEY_PREFIX_BYTES).toString('hex');
  const secret = randomBytes(KEY_SECRET_BYTES).toString('base64url');
  const rawKey = `cfk_${prefix}_${secret}`;
  return { rawKey, keyPrefix: prefix, keyHash: hashApiKey(rawKey) };
}

export function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match?.[1]) {
    return null;
  }
  return match[1].trim();
}

/** Map API key scopes (by object apiName) onto object UUID permissions. */
export function scopesToPermissions(
  scopes: ApiKeyScopes,
  objectsByApiName: Map<string, { id: string }>,
): Map<string, ResolvedPermission> {
  const permissions = new Map<string, ResolvedPermission>();
  for (const [apiName, actions] of Object.entries(scopes)) {
    const object = objectsByApiName.get(apiName);
    if (!object) {
      continue;
    }
    const canRead = actions.includes('read') || actions.includes('write');
    const canWrite = actions.includes('write');
    permissions.set(object.id, {
      objectId: object.id,
      canRead,
      canCreate: canWrite,
      canUpdate: canWrite,
      canDelete: canWrite,
      scope: 'all',
    });
  }
  return permissions;
}
