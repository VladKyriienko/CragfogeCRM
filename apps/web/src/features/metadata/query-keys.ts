export const metadataKeys = {
  objects: (workspaceId: string | null) => ['objects', workspaceId] as const,
  object: (workspaceId: string | null, apiName: string) =>
    ['objects', workspaceId, apiName] as const,
  fields: (workspaceId: string | null, apiName: string) =>
    ['objects', workspaceId, apiName, 'fields'] as const,
};
