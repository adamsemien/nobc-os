'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { useCounts } from '@/components/counts/CountsProvider';
import {
  Home,
  Inbox,
  CalendarDays,
  Users,
  ListChecks,
  BarChart3,
  Activity,
  ScanLine,
  MessageSquare,
  Settings,
  ExternalLink,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  match: string;
  exact?: boolean;
  Icon: typeof Home;
};

const PRIMARY_ITEMS: NavItem[] = [
  { href: '/operator',                 label: 'Dashboard',     match: '/operator',                 exact: true, Icon: Home },
  { href: '/operator/applications',    label: 'Applications',  match: '/operator/applications',                 Icon: Inbox },
  { href: '/operator/events',          label: 'Events',        match: '/operator/events',                       Icon: CalendarDays },
  { href: '/operator/check-in',        label: 'Check-in',      match: '/operator/check-in',                     Icon: ScanLine },
  { href: '/operator/house-phone',     label: 'House Phone',   match: '/operator/house-phone',                  Icon: MessageSquare },
  { href: '/operator/members',         label: 'Members',       match: '/operator/members',                      Icon: Users },
  { href: '/operator/settings/lists',  label: 'Lists',         match: '/operator/settings/lists',               Icon: ListChecks },
  { href: '/operator/intelligence',    label: 'Intelligence',  match: '/operator/intelligence',                 Icon: BarChart3 },
  { href: '/operator/audit',           label: 'Activity',      match: '/operator/audit',                        Icon: Activity },
];

const FOOTER_ITEM: NavItem = {
  href: '/operator/settings',
  label: 'Settings',
  match: '/operator/settings',
  Icon: Settings,
};

const EXTERNAL_LINKS = [
  { href: '/m/events', label: 'Preview Site' },
  { href: '/apply', label: 'Apply Form' },
];

export function OperatorNav({
  pendingApplicationCount = 0,
}: {
  pendingApplicationCount?: number;
}) {
  const pathname = usePathname();
  const { counts } = useCounts();
  // Prefer the live counts from the SoT provider; fall back to the SSR-rendered
  // value so the badge is correct on first paint before the client fetch lands.
  const livePending =
    counts?.applications.pending ?? pendingApplicationCount;

  const renderItem = (item: NavItem) => {
    const active = item.exact
      ? pathname === item.match
      : pathname.startsWith(item.match) && pathname !== '/operator/settings/lists'
        ? pathname.startsWith(item.match)
        : pathname === item.match;
    // Simpler: dashboard is exact, lists is exact-prefix, everything else startsWith.
    const isActive = item.exact
      ? pathname === item.match
      : pathname.startsWith(item.match);
    const showBadge = item.href === '/operator/applications' && livePending > 0;
    const Icon = item.Icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className="group relative flex min-h-[40px] items-center gap-3 overflow-hidden rounded-[8px] px-3 font-[family-name:var(--font-dm-sans)] text-[13px] font-medium transition-colors duration-150"
        style={{
          background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
          color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
        }}
      >
        <span
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full transition-all duration-200"
          style={{
            width: '2px',
            height: isActive ? '60%' : '0%',
            background: 'var(--primary)',
          }}
        />
        <span
          aria-hidden
          className="absolute inset-0 -z-0 origin-left scale-x-0 transition-transform duration-150 group-hover:scale-x-100"
          style={{ background: 'var(--sidebar-active-bg)' }}
        />
        <Icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
        <span className="relative z-10 hidden flex-1 md:inline">{item.label}</span>
        {showBadge ? (
          <span
            className="relative z-10 hidden rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-foreground md:inline-flex"
            style={{ background: 'var(--primary)' }}
            aria-label={`${livePending} pending`}
          >
            {livePending}
          </span>
        ) : null}
        {/* Compact-sidebar badge dot */}
        {showBadge ? (
          <span
            className="absolute right-2 top-2 z-10 h-1.5 w-1.5 rounded-full md:hidden"
            style={{ background: 'var(--primary)' }}
            aria-hidden
          />
        ) : null}
      </Link>
    );
  };

  return (
    <aside
      className="sticky top-0 z-30 flex h-screen w-[68px] shrink-0 flex-col bg-[var(--sidebar)] md:w-[240px]"
      style={{ boxShadow: 'var(--sidebar-shadow)' }}
    >
      {/* Wordmark */}
      <div className="flex h-[60px] items-center px-3 md:px-5">
        <Link
          href="/operator"
          className="font-[family-name:var(--font-dm-sans)] text-[15px] font-semibold leading-tight tracking-tight"
          style={{ color: 'var(--primary)' }}
        >
          <span className="hidden md:inline">No Bad Company</span>
          <span className="md:hidden">NBC</span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-3 md:px-3">
        {PRIMARY_ITEMS.map(renderItem)}

        <div className="my-1.5 mx-1 border-t" style={{ borderColor: 'var(--border)' }} />

        {EXTERNAL_LINKS.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex min-h-[36px] items-center gap-3 overflow-hidden rounded-[8px] px-3 font-[family-name:var(--font-dm-sans)] text-[12px] font-medium transition-colors duration-150 hover:bg-[var(--sidebar-active-bg)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <ExternalLink className="h-[15px] w-[15px] shrink-0" />
            <span className="hidden md:inline">{label}</span>
          </a>
        ))}
      </nav>

      {/* Settings pinned to bottom */}
      <div className="px-2 pb-2 md:px-3">{renderItem(FOOTER_ITEM)}</div>

      {/* Footer — avatar */}
      <div className="flex items-center justify-center border-t border-[var(--border)] px-3 py-3 md:px-4">
        <UserButton />
      </div>
    </aside>
  );
}
