export function renderTemplate(
  template: string,
  record: { name: string; ownerId: string; data: Record<string, unknown> },
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (key === 'name') {
      return record.name;
    }
    if (key === 'owner_id') {
      return record.ownerId;
    }
    const value = record.data[key];
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  });
}
