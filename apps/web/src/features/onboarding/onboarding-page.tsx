import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import {
  createWorkspaceBodySchema,
  industryTemplateIdSchema,
  listIndustryTemplateSummaries,
  workspaceSchema,
  type WorkspaceDto,
} from '@cragfoge/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/features/auth/auth-layout';
import { apiFetch } from '@/lib/api';
import { setStoredWorkspaceId } from '@/lib/workspace';

const onboardingFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  locale: z.string().trim().min(2).max(16),
  templateId: industryTemplateIdSchema,
  includeSampleData: z.boolean(),
});

type FormValues = z.infer<typeof onboardingFormSchema>;

const templates = listIndustryTemplateSummaries();

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: {
      name: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      currency: 'USD',
      locale: 'en',
      templateId: 'generic-sales',
      includeSampleData: false,
    },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      const body = createWorkspaceBodySchema.parse(values);
      const workspace = workspaceSchema.parse(
        await apiFetch<WorkspaceDto>('/workspaces', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
      setStoredWorkspaceId(workspace.id);
      await navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight">{t('onboarding.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('onboarding.description')}</p>
      <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="name">{t('onboarding.fields.name')}</Label>
          <Input id="name" {...form.register('name')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">{t('onboarding.fields.timezone')}</Label>
          <Input id="timezone" {...form.register('timezone')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">{t('onboarding.fields.currency')}</Label>
          <Input id="currency" maxLength={3} {...form.register('currency')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="templateId">{t('onboarding.template')}</Label>
          <select
            id="templateId"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            {...form.register('templateId')}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {t(`onboarding.templates.${template.id}`, { defaultValue: template.name })}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {templates.find((item) => item.id === form.watch('templateId'))?.description}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.watch('includeSampleData')}
            onCheckedChange={(checked) =>
              form.setValue('includeSampleData', checked === true, { shouldDirty: true })
            }
          />
          {t('onboarding.sampleData')}
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {t('onboarding.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
