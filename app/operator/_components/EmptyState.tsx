import Link from 'next/link';
import { CalendarPlus, Inbox, Users } from 'lucide-react';

type Props = {
  icon?: 'event' | 'applications' | 'attendees';
  title: string;
  body?: string;
  action?: { label: string; href: string };
};

const ICONS = {
  event: CalendarPlus,
  applications: Inbox,
  attendees: Users,
};

export function EmptyState({ icon = 'event', title, body, action }: Props) {
  const Icon = ICONS[icon];
  return (
    <div className="page-fade-in flex flex-col items-center justify-center px-6 py-24 text-center font-[family-name:var(--font-dm-sans)]">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-[var(--raised)]">
        <Icon className="h-7 w-7 text-text-tertiary" strokeWidth={1.5} />
      </div>
      <p className="empty-glow text-[18px] font-semibold tracking-tight text-text-primary">
        {title}
      </p>
      {body ? (
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-text-secondary">
          {body}
        </p>
      ) : null}
      {action ? (
        <Link
          href={action.href}
          className="btn-shimmer mt-6 inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-on-primary transition-colors hover:bg-primary-hover"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
