const STORAGE_KEY = 'cragfoge.workspaceId';

export function getStoredWorkspaceId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStoredWorkspaceId(workspaceId: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (workspaceId) {
    window.localStorage.setItem(STORAGE_KEY, workspaceId);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
