import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { signUpBodySchema } from '@cragfoge/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { clearSessionCache } from '@/lib/session-cache';
import { AuthLayout } from './auth-layout';

type FormValues = z.infer<typeof signUpBodySchema>;

export function SignUpPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(signUpBodySchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    const result = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    });
    if (result.error) {
      setError(result.error.message ?? t('auth.errors.generic'));
      return;
    }
    clearSessionCache();
    await navigate({ to: '/onboarding' });
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight">{t('auth.signUp.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('auth.signUp.description')}</p>
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('auth.signingUp') : t('auth.signUp.submit')}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        <Link to="/sign-in" className="hover:text-foreground">
          {t('auth.signUp.toSignIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
