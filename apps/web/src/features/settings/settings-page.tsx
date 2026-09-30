import {
  createInvitationBodySchema,
  createRoleBodySchema,
  memberSchema,
  roleSchema,
  type MemberDto,
  type RoleDto,
} from '@cragfoge/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiKeysSettings } from './api-keys-settings';
import { AutomationsSettings } from './automations-settings';
import { BillingSettings } from './billing-settings';
import { ObjectsSettings } from './objects-settings';
import { WebhooksSettings } from './webhooks-settings';
import { WorkspaceDangerSettings } from './workspace-danger-settings';
import { apiFetch } from '@/lib/api';
import { getStoredWorkspaceId } from '@/lib/workspace';

const membersSchema = z.array(memberSchema);
const rolesSchema = z.array(roleSchema);

export function SettingsPage() {
  const { t } = useTranslation();
  const workspaceId = getStoredWorkspaceId();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ['members', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => membersSchema.parse(await apiFetch<unknown>('/members', { workspaceId })),
  });

  const roles = useQuery({
    queryKey: ['roles', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => rolesSchema.parse(await apiFetch<unknown>('/roles', { workspaceId })),
  });

  const inviteForm = useForm<z.infer<typeof createInvitationBodySchema>>({
    resolver: zodResolver(createInvitationBodySchema),
    defaultValues: { email: '', roleId: '' },
  });

  const roleForm = useForm<z.infer<typeof createRoleBodySchema>>({
    resolver: zodResolver(createRoleBodySchema),
    defaultValues: { name: '', key: '' },
  });

  const inviteMutation = useMutation({
    mutationFn: (body: z.infer<typeof createInvitationBodySchema>) =>
      apiFetch('/invitations', {
        method: 'POST',
        workspaceId,
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      inviteForm.reset({ email: '', roleId: inviteForm.getValues('roleId') });
      await queryClient.invalidateQueries({ queryKey: ['invitations', workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const roleMutation = useMutation({
    mutationFn: (body: z.infer<typeof createRoleBodySchema>) =>
      apiFetch('/roles', {
        method: 'POST',
        workspaceId,
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      roleForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['roles', workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const inviteableRoles = (roles.data ?? []).filter((role) => role.key !== 'owner');

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('settings.description')}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Tabs defaultValue="members">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="members">{t('settings.members.title')}</TabsTrigger>
          <TabsTrigger value="roles">{t('settings.roles.title')}</TabsTrigger>
          <TabsTrigger value="objects">{t('settings.objects.title')}</TabsTrigger>
          <TabsTrigger value="billing">{t('billing.title')}</TabsTrigger>
          <TabsTrigger value="api-keys">{t('settings.apiKeys.title')}</TabsTrigger>
          <TabsTrigger value="webhooks">{t('settings.webhooks.title')}</TabsTrigger>
          <TabsTrigger value="automations">{t('settings.automations.title')}</TabsTrigger>
          <TabsTrigger value="danger">{t('settings.danger.tab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          {members.isPending ? (
            <p className="text-sm text-muted-foreground">{t('settings.loading')}</p>
          ) : null}
          {members.isError ? (
            <p className="text-sm text-muted-foreground">{t('settings.members.forbidden')}</p>
          ) : null}
          {members.data ? (
            <ul className="divide-y rounded-md border">
              {members.data.map((member: MemberDto) => (
                <li key={member.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {member.name} <span className="text-muted-foreground">({member.email})</span>
                  </span>
                  <span className="text-muted-foreground">{member.roleName}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <form
            className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={inviteForm.handleSubmit((values) => {
              setError(null);
              inviteMutation.mutate(values);
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="invite-email">{t('settings.invite.email')}</Label>
              <Input id="invite-email" type="email" {...inviteForm.register('email')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">{t('settings.invite.role')}</Label>
              <select
                id="invite-role"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                {...inviteForm.register('roleId')}
              >
                <option value="">{t('settings.invite.chooseRole')}</option>
                {inviteableRoles.map((role: RoleDto) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {t('settings.invite.submit')}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          {roles.data ? (
            <ul className="divide-y rounded-md border">
              {roles.data.map((role: RoleDto) => (
                <li key={role.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{role.name}</span>
                  <span className="text-muted-foreground">{role.key}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={roleForm.handleSubmit((values) => {
              setError(null);
              roleMutation.mutate(values);
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="role-name">{t('settings.roles.name')}</Label>
              <Input id="role-name" {...roleForm.register('name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-key">{t('settings.roles.key')}</Label>
              <Input id="role-key" {...roleForm.register('key')} />
            </div>
            <Button type="submit" disabled={roleMutation.isPending}>
              {t('settings.roles.submit')}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="objects">
          <ObjectsSettings workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="billing">
          <BillingSettings workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="api-keys">
          <ApiKeysSettings workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="webhooks">
          <WebhooksSettings workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="automations">
          <AutomationsSettings workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="danger">
          <WorkspaceDangerSettings workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
