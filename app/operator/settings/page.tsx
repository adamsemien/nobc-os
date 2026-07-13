import Link from 'next/link';
import {
  ClipboardList,
  Sparkles,
  Palette,
  ListChecks,
  Webhook,
  Activity,
  Mail,
  Trophy,
  Users,
  SlidersHorizontal,
} from 'lucide-react';
import { PageHeader } from '../_components/PageHeader';
import { auth } from '@clerk/nextjs/server';
import { getMemberWorkspaceId } from '@/lib/auth';
import { isAdmin } from '@/lib/operator-role';
import { isDevUser } from '@/lib/dev-users';
import { OpenDevToolbarButton } from './OpenDevToolbarButton';
import { SeedGravityLedgerButton } from './SeedGravityLedgerButton';

type Card = {
  href: string;
  title: string;
  description: string;
  Icon: typeof ClipboardList;
};

const CARDS: Card[] = [
  {
    href: '/operator/settings/application',
    title: 'Application Form',
    description: 'Edit your member application questions.',
    Icon: ClipboardList,
  },
  {
    href: '/operator/settings/member-fields',
    title: 'Member Fields',
    description: 'Define the custom fields shown on every member record.',
    Icon: SlidersHorizontal,
  },
  {
    href: '/operator/settings/communications',
    title: 'Communications',
    description: 'Email templates, cadences, and auto-notifications.',
    Icon: Mail,
  },
  {
    href: '/operator/settings/tiers',
    title: 'Member Tiers',
    description: 'Rename Resident / Member / Considering to fit your brand.',
    Icon: Trophy,
  },
  {
    href: '/operator/settings/model',
    title: 'AI Model',
    description: 'Choose which Claude model powers your platform.',
    Icon: Sparkles,
  },
  {
    href: '/operator/settings/theme',
    title: 'Theme',
    description: 'Customize your operator dashboard appearance.',
    Icon: Palette,
  },
  {
    href: '/operator/settings/lists',
    title: 'Lists',
    description: 'Manage Purple and Blocked lists.',
    Icon: ListChecks,
  },
  {
    href: '/operator/settings/webhooks',
    title: 'Webhooks',
    description: 'Connect external services to NoBC events.',
    Icon: Webhook,
  },
  {
    href: '/operator/team',
    title: 'Team',
    description: 'Manage operator access and roles.',
    Icon: Users,
  },
  {
    href: '/operator/audit',
    title: 'Activity Log',
    description: 'Full audit trail of operator, member, and agent actions.',
    Icon: Activity,
  },
];

export default async function SettingsLandingPage() {
  const { userId } = await auth();
  // Same predicate as the DevToolbar itself (lib/dev-users.ts): local dev always
  // sees Developer tools; prod/preview require a NEXT_PUBLIC_DEV_USER_IDS entry.
  const isDev = isDevUser(userId);
  // Developer section requires ADMIN role in addition to dev context — seed tool resets demo tenant.
  const workspaceId = await getMemberWorkspaceId(userId);
  const operatorIsAdmin = await isAdmin(userId, workspaceId);

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1100px]">
        <PageHeader
          title="Settings"
          subtitle="Configure how your platform works."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map(({ href, title, description, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary"
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md"
                  style={{ background: 'var(--primary-soft, var(--muted))', color: 'var(--primary)' }}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <h2 className="text-base font-semibold text-text-primary">{title}</h2>
              </div>
              <p className="text-sm leading-relaxed text-text-secondary">{description}</p>
              <span className="mt-auto text-xs font-medium text-primary opacity-70 transition-opacity group-hover:opacity-100">
                Configure →
              </span>
            </Link>
          ))}
        </div>

        {isDev && operatorIsAdmin && (
          <section className="mt-10 border-t border-border pt-8">
            <h2 className="mb-1 text-base font-semibold text-text-primary">Developer</h2>
            <p className="mb-4 text-sm text-text-secondary">
              Internal tooling — visible only to developers.
            </p>
            <div className="flex flex-col gap-4">
              <OpenDevToolbarButton />
              <SeedGravityLedgerButton />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
