import { auth } from '@clerk/nextjs/server';
import { Breadcrumbs, PageHeader } from '../../_components/PageHeader';
import { requireWorkspaceId } from '@/lib/auth';
import { getWorkspaceTierNames } from '@/lib/workspace-tier-names';
import { DEFAULT_TIER_NAMES } from '@/lib/score-display';
import { TierNamesEditor } from './_components/TierNamesEditor';

export default async function TiersSettingsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const workspaceId = await requireWorkspaceId(userId);
  const tierNames = await getWorkspaceTierNames(workspaceId);

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[640px]">
        <Breadcrumbs
          items={[{ href: '/operator/settings', label: 'Settings' }, { label: 'Member Tiers' }]}
        />
        <PageHeader
          title="Member Tiers"
          subtitle="Three names for the three score bands. Used everywhere — application scoring, member directory, intelligence."
        />
        <TierNamesEditor initial={tierNames} defaults={DEFAULT_TIER_NAMES} />
      </div>
    </div>
  );
}
