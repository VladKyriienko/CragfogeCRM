import { describe, expect, it } from 'vitest';
import { renderTemplate } from './template';

describe('renderTemplate', () => {
  it('replaces name, owner_id, and data fields', () => {
    const rendered = renderTemplate('Hi {{name}} ({{owner_id}}) stage={{stage}}', {
      name: 'Acme Deal',
      ownerId: 'user-1',
      data: { stage: 'won' },
    });
    expect(rendered).toBe('Hi Acme Deal (user-1) stage=won');
  });
});
