import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { setupStatusSchema, signInBodySchema } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { clearSessionCache } from '@/lib/session-cache';
import { AuthLayout } from './auth-layout';

type FormValues = z.infer<typeof signInBodySchema>;

export function SignInPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const setup = useQuery({
    queryKey: ['setup-status'],
    queryFn: async () => setupStatusSchema.parse(await apiFetch('/setup/status')),
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(signInBodySchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (setup.isSuccess && setup.data.needsSetup) {
      void navigate({ to: '/setup' });
    }
  }, [setup.isSuccess, setup.data?.needsSetup, navigate]);

  async function onSubmit(values: FormValues) {
    setError(null);
    const result = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (result.error) {
      setError(result.error.message ?? t('auth.errors.generic'));
      return;
    }
    clearSessionCache();
    await navigate({ to: '/' });
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight">{t('auth.signIn.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('auth.signIn.description')}</p>
      <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.fields.email')}</Label>
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.fields.password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('auth.signingIn') : t('auth.signIn.submit')}
        </Button>
      </form>
      <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
        <Link to="/forgot-password" className="hover:text-foreground">
          {t('auth.signIn.forgot')}
        </Link>
        <Link to="/sign-up" className="hover:text-foreground">
          {t('auth.signIn.toSignUp')}
        </Link>
      </div>
    </AuthLayout>
  );
}
