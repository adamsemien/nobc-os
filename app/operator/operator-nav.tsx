'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { Inbox, CalendarDays, ScrollText, Webhook, BarChart3 } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/operator/applications', label: 'Applications', match: '/operator/applications', Icon: Inbox },
  { href: '/operator/intelligence', label: 'Intelligence', match: '/operator/intelligence', Icon: BarChart3 },
  { href: '/operator/events', label: 'Events', match: '/operator/events', Icon: CalendarDays },
  { href: '/operator/audit', label: 'Audit', match: '/operator/audit', Icon: ScrollText },
  { href: '/operator/settings/webhooks', label: 'Webhooks', match: '/operator/settings', Icon: Webhook },
];

export function OperatorNav() {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 z-30 flex h-screen w-[68px] shrink-0 flex-col bg-[var(--sidebar)] md:w-[240px]"
      style={{ boxShadow: 'var(--sidebar-shadow)' }}
    >
      {/* Wordmark */}
      <div className="flex h-[60px] items-center px-3 md:px-5">
        <Link
          href="/operator/applications"
          className="font-[family-name:var(--font-dm-sans)] text-[15px] font-semibold leading-tight tracking-tight"
          style={{ color: 'var(--primary)' }}
        >
          <span className="hidden md:inline">No Bad Company</span>
          <span className="md:hidden">NBC</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-2 py-3 md:px-3">
        {NAV_ITEMS.map(({ href, label, match, Icon }) => {
          const active = pathname.startsWith(match);
          return (
            <Link
              key={href}
              href={href}
              className="group relative flex min-h-[40px] items-center gap-3 overflow-hidden rounded-[8px] px-3 font-[family-name:var(--font-dm-sans)] text-[13px] font-medium transition-colors duration-150"
              style={{
                background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            >
              {/* Active left border */}
              <span
                aria-hidden
                className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full transition-all duration-200"
                style={{
                  width: '2px',
                  height: active ? '60%' : '0%',
                  background: 'var(--primary)',
                }}
              />
              {/* Hover wash */}
              <span
                aria-hidden
                className="absolute inset-0 -z-0 origin-left scale-x-0 transition-transform duration-150 group-hover:scale-x-100"
                style={{ background: 'var(--sidebar-active-bg)' }}
              />
              <Icon className="relative z-10 h-[18px] w-[18px] shrink-0" />
              <span className="relative z-10 hidden md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer — avatar */}
      <div className="flex items-center justify-center border-t border-[var(--border)] px-3 py-3 md:px-4">
        <UserButton />
      </div>
    </aside>
  );
}
