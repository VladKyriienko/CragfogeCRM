import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { resetPasswordBodySchema } from '@cragfoge/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { AuthLayout } from './auth-layout';

const formSchema = resetPasswordBodySchema.pick({ newPassword: true });
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/reset-password' });
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { newPassword: '' },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    if (!search.token) {
      setError(t('auth.reset.missingToken'));
      return;
    }
    const result = await authClient.resetPassword({
      token: search.token,
      newPassword: values.newPassword,
    });
    if (result.error) {
      setError(result.error.message ?? t('auth.errors.generic'));
      return;
    }
    await navigate({ to: '/sign-in' });
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-semibold tracking-tight">{t('auth.reset.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('auth.reset.description')}</p>
      <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="newPassword">{t('auth.fields.newPassword')}</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...form.register('newPassword')}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.reset.submit')}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        <Link to="/sign-in" className="hover:text-foreground">
          {t('auth.backToSignIn')}
        </Link>
      </p>
    </AuthLayout>
  );
}
