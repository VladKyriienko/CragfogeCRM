import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import { bottomNavItems, topNavItems } from './features/shell/nav';

const navItems = [...topNavItems, ...bottomNavItems];

function readKey(source: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

describe('english copy', () => {
  it('has a string for every navigation item', () => {
    for (const item of navItems) {
      expect(typeof readKey(en, item.labelKey)).toBe('string');
    }
  });

  it('names the product', () => {
    expect(en.app.name).toBe('Cragfoge CRM');
  });
});
