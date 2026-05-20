import { auth } from '@clerk/nextjs/server';
import { Breadcrumbs, PageHeader } from '../../_components/PageHeader';
import { requireWorkspaceId } from '@/lib/auth';
import { getWorkspaceTierNames } from '@/lib/workspace-tier-names';
import { DEFAULT_TIER_NAMES } from '@/lib/score-display';
import { TierNamesEditor } from './_components/TierNamesEditor';
import { MembershipTiersEditor } from './_components/MembershipTiersEditor';

export default async function TiersSettingsPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const workspaceId = await requireWorkspaceId(userId);
  const tierNames = await getWorkspaceTierNames(workspaceId);

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[720px] space-y-12">
        <Breadcrumbs
          items={[
            { href: '/operator/settings', label: 'Settings' },
            { label: 'Member Tiers' },
          ]}
        />
        <div>
          <PageHeader
            title="Member Tiers"
            subtitle="Define the membership tiers operators can gate events on. Each tier has a name and an optional minimum aiScore."
          />
          <MembershipTiersEditor />
        </div>

        <div>
          <h2 className="text-base font-semibold text-text-primary">
            Score-band display names
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Used in legacy surfaces still keyed on the original three score
            bands (intelligence, application scoring labels).
          </p>
          <div className="mt-4">
            <TierNamesEditor
              initial={tierNames}
              defaults={DEFAULT_TIER_NAMES}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
