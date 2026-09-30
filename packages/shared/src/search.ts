import { z } from 'zod';

export const globalSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;

export const globalSearchResultSchema = z.object({
  objectApiName: z.string(),
  objectLabel: z.string(),
  recordId: z.string().uuid(),
  name: z.string(),
});
export type GlobalSearchResult = z.infer<typeof globalSearchResultSchema>;

export const globalSearchResponseSchema = z.object({
  items: z.array(globalSearchResultSchema),
});
export type GlobalSearchResponse = z.infer<typeof globalSearchResponseSchema>;
