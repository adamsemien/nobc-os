import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { JUDGMENT_MODEL, MECHANICAL_MODEL } from '@/lib/ai/runtime-models';
import { PageHeader } from '../../_components/PageHeader';

/** Read-only display of the locked two-tier model policy.
 *
 *  This page previously offered a model switcher that wrote Workspace.aiModel —
 *  a field with zero runtime consumers (every Anthropic call reads
 *  lib/ai/runtime-models.ts), so the choice was a placebo that contradicted the
 *  Locked Decisions ("Adam decides model bumps and tier moves explicitly").
 *  The honest surface states the policy instead of implying a choice. */
export default async function ModelSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const tiers = [
    {
      name: 'Judgment',
      model: JUDGMENT_MODEL,
      usedFor:
        'Application scoring, reveal personalization, application tagging, the AI event builder, event descriptions, the Intelligence composer, and the operator chat agent.',
    },
    {
      name: 'Mechanical',
      model: MECHANICAL_MODEL,
      usedFor:
        'DAM alt-text, firmographics backfill, House Phone SMS triage and categorization, and recap / sponsor-briefing narratives.',
    },
  ];

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[820px]">
        <PageHeader
          title="AI Models"
          subtitle="The locked two-tier model policy behind every AI feature."
          crumbs={[
            { href: '/operator/settings', label: 'Settings' },
            { label: 'AI Models' },
          ]}
        />

        <div className="space-y-4">
          {tiers.map((tier) => (
            <div key={tier.name} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-semibold text-text-primary">{tier.name} tier</h2>
                <code className="rounded bg-muted px-2 py-0.5 text-xs text-text-secondary">
                  {tier.model}
                </code>
              </div>
              <p className="mt-2 text-sm text-text-secondary">{tier.usedFor}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-text-muted">
          These assignments are a platform policy, not a per-workspace preference — model
          upgrades and tier moves are decided explicitly, never switched here.
        </p>
      </div>
    </div>
  );
}
