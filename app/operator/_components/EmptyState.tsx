import { CalendarPlus, Inbox, Users } from 'lucide-react';
import Link from 'next/link';
import { EmptyState as BaseEmptyState } from '@/components/ui/EmptyState';

type LegacyProps = {
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

/**
 * Backwards-compatible wrapper around the new `<EmptyState>` primitive.
 * New code should import directly from `@/components/ui`.
 */
export function EmptyState({ icon = 'event', title, body, action }: LegacyProps) {
  return (
    <BaseEmptyState
      icon={ICONS[icon]}
      title={title}
      subtitle={body}
      action={
        action ? (
          <Link
            href={action.href}
            className="btn-shimmer inline-flex items-center gap-2 rounded-[8px] bg-primary px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-on-primary transition-colors hover:bg-primary-hover"
          >
            {action.label}
          </Link>
        ) : null
      }
    />
  );
}
