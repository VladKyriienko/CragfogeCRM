import { describe, expect, it } from 'vitest';
import { getIndustryTemplate, listIndustryTemplates } from './catalog';
import { industryTemplateIdSchema, industryTemplateSchema } from './schema';

describe('industry templates', () => {
  it('parses all five templates', () => {
    const all = listIndustryTemplates();
    expect(all).toHaveLength(5);
    for (const template of all) {
      expect(() => industryTemplateSchema.parse(template)).not.toThrow();
      expect(industryTemplateIdSchema.parse(template.id)).toBe(template.id);
    }
  });

  it('real-estate includes properties, pipeline view, and automation', () => {
    const template = getIndustryTemplate('real-estate');
    expect(template.objects.some((o) => o.apiName === 'properties')).toBe(true);
    expect(template.objects.some((o) => o.apiName === 'people')).toBe(true);
    expect(template.fields.some((f) => f.objectApiName === 'deals' && f.apiName === 'stage')).toBe(
      true,
    );
    expect(template.views.some((v) => v.objectApiName === 'deals')).toBe(true);
    expect(template.automations.length).toBeGreaterThanOrEqual(1);
  });
});
