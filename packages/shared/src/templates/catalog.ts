import { industryTemplateSchema, type IndustryTemplate, type IndustryTemplateId } from './schema';
import agency from './agency.json';
import beautySalon from './beauty-salon.json';
import genericSales from './generic-sales.json';
import realEstate from './real-estate.json';
import trades from './trades.json';

const templates: IndustryTemplate[] = [
  industryTemplateSchema.parse(genericSales),
  industryTemplateSchema.parse(agency),
  industryTemplateSchema.parse(realEstate),
  industryTemplateSchema.parse(beautySalon),
  industryTemplateSchema.parse(trades),
];

const byId = new Map(templates.map((template) => [template.id, template]));

export function listIndustryTemplates(): IndustryTemplate[] {
  return templates;
}

export function getIndustryTemplate(id: IndustryTemplateId): IndustryTemplate {
  const template = byId.get(id);
  if (!template) {
    throw new Error(`Unknown industry template: ${id}`);
  }
  return template;
}

export function listIndustryTemplateSummaries() {
  return templates.map(({ id, name, description }) => ({ id, name, description }));
}
