'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCounts } from '@/components/counts/CountsProvider';
import {
  Home,
  Inbox,
  CalendarDays,
  Images,
  Users,
  BarChart3,
  Handshake,
  MessageSquare,
  Settings,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  match: string;
  exact?: boolean;
  Icon: typeof Home;
};

const PRIMARY_ITEMS: NavItem[] = [
  { href: '/operator',              label: 'Dashboard',    match: '/operator',              exact: true, Icon: Home },
  { href: '/operator/events',       label: 'Events',       match: '/operator/events',                    Icon: CalendarDays },
  { href: '/operator/applications', label: 'Applications', match: '/operator/applications',              Icon: Inbox },
  { href: '/operator/members',      label: 'Members',      match: '/operator/members',                   Icon: Users },
  { href: '/operator/house-phone',  label: 'House Phone',  match: '/operator/house-phone',               Icon: MessageSquare },
  { href: '/operator/media',        label: 'Media',        match: '/operator/media',                     Icon: Images },
  { href: '/operator/intelligence', label: 'Intelligence', match: '/operator/intelligence',              Icon: BarChart3 },
  { href: '/operator/sponsors',     label: 'Sponsors',     match: '/operator/sponsors',                  Icon: Handshake },
];

const FOOTER_ITEM: NavItem = {
  href: '/operator/settings',
  label: 'Settings',
  match: '/operator/settings',
  Icon: Settings,
};

export function OperatorNav({
  pendingApplicationCount = 0,
  isAdmin: _isAdmin = false,
}: {
  pendingApplicationCount?: number;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { counts } = useCounts();
  // Prefer the live counts from the SoT provider; fall back to the SSR-rendered
  // value so the badge is correct on first paint before the client fetch lands.
  const livePending =
    counts?.applications.pending ?? pendingApplicationCount;

  const renderItem = (item: NavItem) => {
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
      className="z-30 flex w-[68px] shrink-0 flex-col bg-[var(--sidebar)] md:w-[240px]"
      style={{ boxShadow: 'var(--sidebar-shadow)' }}
    >
      {/* Sticky inner column stays in the viewport while the page scrolls, so the
          rail background fills the full document height (no cut-off on long pages)
          while the nav itself never leaves view. */}
      <div className="sticky top-0 flex h-screen flex-col">
        {/* Wordmark */}
        <div className="flex h-[60px] items-center px-3 md:px-5">
          <Link
            href="/operator"
            className="font-[family-name:var(--font-dm-sans)] text-[15px] font-semibold leading-tight tracking-tight"
            style={{ color: 'var(--primary)' }}
          >
            <span className="hidden md:inline">No Bad Company</span>
            <span className="md:hidden">NoBC</span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-3 md:px-3">
          {PRIMARY_ITEMS.map(renderItem)}
        </nav>

        {/* Settings pinned to bottom */}
        <div className="px-2 pb-3 md:px-3">{renderItem(FOOTER_ITEM)}</div>
      </div>
    </aside>
  );
}
