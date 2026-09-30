import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, scopesToPermissions } from './api-key.util';

describe('api key utils', () => {
  it('generates cfk_ keys with stable hash', () => {
    const generated = generateApiKey();
    expect(generated.rawKey.startsWith('cfk_')).toBe(true);
    expect(hashApiKey(generated.rawKey)).toBe(generated.keyHash);
  });

  it('maps write scope to create/update/delete', () => {
    const permissions = scopesToPermissions(
      { deals: ['read'], people: ['write'] },
      new Map([
        ['deals', { id: 'obj-deals' }],
        ['people', { id: 'obj-people' }],
      ]),
    );
    expect(permissions.get('obj-deals')).toMatchObject({
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    expect(permissions.get('obj-people')).toMatchObject({
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    });
  });
});
