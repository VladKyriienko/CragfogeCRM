export const recordsKeys = {
  listPrefix: (workspaceId: string | null, objectApiName: string) =>
    ['records', workspaceId, objectApiName, 'list'] as const,
  list: (workspaceId: string | null, objectApiName: string, params: unknown) =>
    ['records', workspaceId, objectApiName, 'list', params] as const,
  detail: (workspaceId: string | null, objectApiName: string, recordId: string) =>
    ['records', workspaceId, objectApiName, 'detail', recordId] as const,
  views: (workspaceId: string | null, objectApiName: string) =>
    ['views', workspaceId, objectApiName] as const,
  files: (workspaceId: string | null, objectApiName: string, recordId: string) =>
    ['files', workspaceId, objectApiName, recordId] as const,
  exportJob: (workspaceId: string | null, objectApiName: string, jobId: string) =>
    ['export-job', workspaceId, objectApiName, jobId] as const,
};
