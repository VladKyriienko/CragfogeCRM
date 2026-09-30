import { LayoutDashboard, Settings, type LucideIcon } from 'lucide-react';

/** Static nav items shown above/below the dynamic per-object Records section. */
export const topNavItems = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, exact: true },
] as const satisfies ReadonlyArray<{ to: '/'; labelKey: string; icon: LucideIcon; exact: boolean }>;

export const bottomNavItems = [
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, exact: false },
] as const satisfies ReadonlyArray<{
  to: '/settings';
  labelKey: string;
  icon: LucideIcon;
  exact: boolean;
}>;
