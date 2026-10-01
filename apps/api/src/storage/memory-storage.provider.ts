import type { StorageProvider } from './storage.types';

/** In-process object store for tests. CI does not run MinIO. */
export class MemoryStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
    this.objects.set(key, Buffer.from(body));
  }

  async getObject(key: string): Promise<Buffer> {
    const body = this.objects.get(key);
    if (!body) {
      throw new Error(`Object not found for key "${key}"`);
    }
    return Buffer.from(body);
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
