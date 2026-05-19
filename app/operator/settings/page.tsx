import Link from 'next/link';
import {
  ClipboardList,
  Sparkles,
  Palette,
  ListChecks,
  Webhook,
  Activity,
  Mail,
} from 'lucide-react';
import { PageHeader } from '../_components/PageHeader';

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
    href: '/operator/settings/communications',
    title: 'Communications',
    description: 'Email templates, cadences, and auto-notifications.',
    Icon: Mail,
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
    href: '/operator/audit',
    title: 'Activity Log',
    description: 'Full audit trail of operator, member, and agent actions.',
    Icon: Activity,
  },
];

export default function SettingsLandingPage() {
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
      </div>
    </div>
  );
}
