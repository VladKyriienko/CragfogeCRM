import type { WorkspaceDto } from '@cragfoge/shared';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { setStoredWorkspaceId } from '@/lib/workspace';

type Props = {
  workspaces: WorkspaceDto[];
  currentWorkspaceId: string | null;
  onChange: (workspaceId: string) => void;
};

export function WorkspaceSwitcher({ workspaces, currentWorkspaceId, onChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (workspaces.length === 0) {
    return <span className="text-sm text-muted-foreground">{t('topbar.noWorkspace')}</span>;
  }

  return (
    <select
      className="h-9 max-w-56 rounded-md border border-input bg-background px-2 text-sm"
      aria-label={t('topbar.workspace')}
      value={currentWorkspaceId ?? ''}
      onChange={(event) => {
        const next = event.target.value;
        if (next === '__create__') {
          void navigate({ to: '/onboarding' });
          return;
        }
        setStoredWorkspaceId(next);
        onChange(next);
      }}
    >
      {workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name}
        </option>
      ))}
      <option value="__create__">{t('topbar.createWorkspace')}</option>
    </select>
  );
}
