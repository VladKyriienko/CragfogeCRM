import { z } from 'zod';
import { workspaceIdSchema } from './ids';
import { industryTemplateIdSchema } from './templates/schema';

export const createWorkspaceBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  locale: z.string().trim().min(2).max(16).default('en'),
  templateId: industryTemplateIdSchema.default('generic-sales'),
  includeSampleData: z.boolean().default(false),
});

export const workspaceSchema = z.object({
  id: workspaceIdSchema,
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  currency: z.string(),
  locale: z.string(),
  plan: z.string(),
  roleKey: z.string(),
  roleName: z.string(),
  deletionScheduledAt: z.string().datetime().nullable().optional(),
});

export const onboardingChecklistStepIdSchema = z.enum([
  'import_contacts',
  'invite_team',
  'customize_fields',
  'create_record',
  'connect_integration',
]);

export type OnboardingChecklistStepId = z.infer<typeof onboardingChecklistStepIdSchema>;

export const onboardingChecklistSchema = z.object({
  steps: z.array(
    z.object({
      id: onboardingChecklistStepIdSchema,
      completed: z.boolean(),
      dismissed: z.boolean(),
    }),
  ),
  dismissedAll: z.boolean(),
});

export type OnboardingChecklist = z.infer<typeof onboardingChecklistSchema>;

export const patchOnboardingBodySchema = z.object({
  dismissStep: onboardingChecklistStepIdSchema.optional(),
  completeStep: onboardingChecklistStepIdSchema.optional(),
  dismissedAll: z.boolean().optional(),
});

export type PatchOnboardingBody = z.infer<typeof patchOnboardingBodySchema>;

export type CreateWorkspaceBody = z.infer<typeof createWorkspaceBodySchema>;
export type WorkspaceDto = z.infer<typeof workspaceSchema>;
