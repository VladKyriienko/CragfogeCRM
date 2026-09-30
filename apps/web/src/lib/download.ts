/**
 * Downloads a file from the API by fetching it directly (so we can attach the
 * X-Workspace-Id header, which a plain anchor navigation cannot do) and then
 * triggering a browser download via a temporary blob URL.
 */
export async function downloadApiFile(
  path: string,
  filename: string,
  workspaceId: string | null,
): Promise<void> {
  const headers = new Headers();
  if (workspaceId) {
    headers.set('X-Workspace-Id', workspaceId);
  }
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Reads a File/Blob as a base64 string (without the `data:...;base64,` prefix). */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
