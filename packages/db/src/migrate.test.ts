import { describe, expect, it } from 'vitest';
import { quoteLiteral, rolePasswordFromUrl } from './migrate';

describe('role password helpers', () => {
  it('reads and decodes the password from a connection URL', () => {
    expect(rolePasswordFromUrl('postgresql://crm_app:s3cr%40t%2Fx@db:5432/crm')).toBe('s3cr@t/x');
  });

  it('rejects a URL without a password', () => {
    expect(() => rolePasswordFromUrl('postgresql://crm_app@db:5432/crm')).toThrow(/password/);
  });

  it('escapes single quotes in SQL literals', () => {
    expect(quoteLiteral("a'b")).toBe("'a''b'");
    expect(quoteLiteral("'; drop table users; --")).toBe("'''; drop table users; --'");
  });
});
