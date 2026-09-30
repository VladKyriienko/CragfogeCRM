import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EntitlementsBanner } from '@/features/billing/entitlements-banner';
import { useObjects } from '@/features/metadata/use-objects';
import { CommandPalette } from '@/features/search/command-palette';
import { WorkspaceSwitcher } from '@/features/workspaces/workspace-switcher';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';
import { authClient } from '@/lib/auth-client';
import { getObjectIcon } from '@/lib/object-icon';
import { clearSessionCache } from '@/lib/session-cache';
import { bottomNavItems, topNavItems } from './nav';

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workspaces = useWorkspaces();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const currentWorkspaceId = workspaceId ?? workspaces.data?.currentId ?? null;
  const objects = useObjects(currentWorkspaceId);
  const session = authClient.useSession();

  async function signOut() {
    await authClient.signOut();
    clearSessionCache();
    queryClient.clear();
    await navigate({ to: '/sign-in' });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar md:w-60 md:border-r md:border-b-0">
        <div className="flex h-14 items-center px-4 text-sm font-semibold tracking-tight">
          {t('app.name')}
        </div>
        <nav className="flex flex-col gap-1 overflow-y-auto px-3 pb-3 md:flex-1">
          {topNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              exact={item.exact}
              icon={item.icon}
              label={t(item.labelKey)}
            />
          ))}

          {objects.data && objects.data.length > 0 ? (
            <>
              <p className="mt-4 px-3 text-xs font-medium uppercase text-muted-foreground">
                {t('nav.recordsSection')}
              </p>
              {objects.data.map((object) => {
                const Icon = getObjectIcon(object.icon);
                return (
                  <NavLink
                    key={object.id}
                    to="/records/$objectApiName"
                    params={{ objectApiName: object.apiName }}
                    exact={false}
                    icon={Icon}
                    label={object.labelPlural}
                  />
                );
              })}
            </>
          ) : null}

          <div className="mt-4 border-t pt-3">
            {bottomNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                exact={item.exact}
                icon={item.icon}
                label={t(item.labelKey)}
              />
            ))}
          </div>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b px-4 md:px-6">
          <WorkspaceSwitcher
            workspaces={workspaces.data?.workspaces ?? []}
            currentWorkspaceId={currentWorkspaceId}
            onChange={(next) => {
              setWorkspaceId(next);
              void queryClient.invalidateQueries();
              void navigate({ to: pathname });
            }}
          />
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
              }
            >
              <Search className="size-4" />
              <span className="hidden sm:inline">{t('search.trigger')}</span>
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.data?.user.email ?? t('topbar.account')}
            </span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              {t('auth.signOut')}
            </Button>
          </div>
        </header>
        <EntitlementsBanner workspaceId={currentWorkspaceId} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette workspaceId={currentWorkspaceId} />
    </div>
  );
}

type NavLinkProps = {
  to: string;
  params?: Record<string, string>;
  exact: boolean;
  icon: (typeof topNavItems)[number]['icon'];
  label: string;
};

function NavLink({ to, params, exact, icon: Icon, label }: NavLinkProps) {
  // Cast to `any`: this link renders both static routes and a dynamic per-object
  // records route, which TanStack Router's strict literal `to` typing can't express here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkProps: any = { to, params, activeOptions: { exact } };
  return (
    <Link
      {...linkProps}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      activeProps={{
        className: 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
      }}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
