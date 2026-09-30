import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { forgotPasswordBodySchema } from '@cragfoge/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { AuthLayout } from './auth-layout';

type FormValues = z.infer<typeof forgotPasswordBodySchema>;

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(forgotPasswordBodySchema),
    defaultValues: {
      email: '',
      redirectTo: `${window.location.origin}/reset-password`,
    },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    const result = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: values.redirectTo,
    });
    if (result.error) {
      setError(result.error.message ?? t('auth.errors.generic'));
      return;
    }
    setSent(true);
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight">{t('auth.forgot.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('auth.forgot.description')}</p>
      {sent ? (
        <p className="mt-6 text-sm">{t('auth.forgot.sent')}</p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.fields.email')}</Label>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        <Link to="/sign-in" className="hover:text-foreground">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
