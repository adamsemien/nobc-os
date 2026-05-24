import { OperatorRole } from '@prisma/client';
import { requireRolePage } from '@/lib/operator-role';
import { SettingsTabs } from './SettingsTabs';

// Settings is ADMIN-only. Non-admin operators are redirected to the operator
// home. (Team management lives at /operator/team so it can stay viewable by
// non-admins — see that route.)
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage(OperatorRole.ADMIN);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsTabs />
      {children}
    </div>
  );
}
