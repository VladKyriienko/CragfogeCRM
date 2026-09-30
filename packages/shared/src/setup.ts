import { z } from 'zod';

export const setupStatusSchema = z.object({
  needsSetup: z.boolean(),
});

export type SetupStatus = z.infer<typeof setupStatusSchema>;
