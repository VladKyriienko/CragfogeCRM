import { z } from 'zod';

/** Upload payloads are base64-encoded JSON bodies; keep them well under the API's JSON limit. */
export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

export const fileSchema = z.object({
  id: z.string().uuid(),
  recordId: z.string().uuid(),
  objectId: z.string().uuid(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedBy: z.string(),
  createdAt: z.coerce.date(),
});
export type FileDto = z.infer<typeof fileSchema>;

export const uploadFileBodySchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  /** Base64-encoded file contents. */
  data: z.string().min(1),
});
export type UploadFileBody = z.infer<typeof uploadFileBodySchema>;

export const listFilesResponseSchema = z.object({
  items: z.array(fileSchema),
});
export type ListFilesResponse = z.infer<typeof listFilesResponseSchema>;
