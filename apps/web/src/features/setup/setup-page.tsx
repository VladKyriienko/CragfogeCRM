import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import {
  createWorkspaceBodySchema,
  industryTemplateIdSchema,
  listIndustryTemplateSummaries,
  setupStatusSchema,
  workspaceSchema,
  type WorkspaceDto,
} from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout } from '@/features/auth/auth-layout';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { clearSessionCache } from '@/lib/session-cache';
import { setStoredWorkspaceId } from '@/lib/workspace';

const setupFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  workspaceName: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  templateId: industryTemplateIdSchema,
  includeSampleData: z.boolean(),
});

type FormValues = z.infer<typeof setupFormSchema>;

const templates = listIndustryTemplateSummaries();

async function fetchSetupStatus() {
  return setupStatusSchema.parse(await apiFetch('/setup/status'));
}

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({ queryKey: ['setup-status'], queryFn: fetchSetupStatus });

  const form = useForm<FormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      workspaceName: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      currency: 'USD',
      templateId: 'generic-sales',
      includeSampleData: true,
    },
  });

  useEffect(() => {
    if (status.isSuccess && !status.data.needsSetup) {
      void navigate({ to: '/sign-in' });
    }
  }, [status.isSuccess, status.data?.needsSetup, navigate]);

  async function onSubmit(values: FormValues) {
    setError(null);
    const signUp = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });
    if (signUp.error) {
      setError(signUp.error.message ?? t('auth.errors.generic'));
      return;
    }
    clearSessionCache();
    try {
      const body = createWorkspaceBodySchema.parse({
        name: values.workspaceName,
        timezone: values.timezone,
        currency: values.currency,
        locale: 'en',
        templateId: values.templateId,
        includeSampleData: values.includeSampleData,
      });
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
      <h1 className="text-xl font-semibold tracking-tight">{t('setup.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('setup.description')}</p>
      <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="name">{t('auth.fields.name')}</Label>
          <Input id="name" autoComplete="name" {...form.register('name')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.fields.email')}</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.fields.password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...form.register('password')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspaceName">{t('onboarding.fields.name')}</Label>
          <Input id="workspaceName" {...form.register('workspaceName')} />
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
          {form.formState.isSubmitting ? t('setup.submitting') : t('setup.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
