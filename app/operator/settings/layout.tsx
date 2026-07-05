import { requirePermissionPage } from '@/lib/operator-role';
import { SettingsTabs } from './SettingsTabs';

// Settings is OWNER-only (settings.edit) under Minimal RBAC (Phase 1.5) — it maps
// to the same permission the settings/* API routes enforce, so a non-OWNER never
// sees a page they'd be 403'd from saving. Team management lives at /operator/team
// (viewable by any operator; role changes are OWNER-only there).
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePermissionPage('settings.edit');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsTabs />
      {children}
    </div>
  );
}
