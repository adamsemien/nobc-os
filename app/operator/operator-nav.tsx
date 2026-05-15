'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

const wordmarkStyle = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  color: 'var(--nobc-red)',
} as const;

const linkBase = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  color: 'var(--nobc-ink)',
} as const;

const NAV_ITEMS = [
  { href: '/operator/applications', label: 'Applications', match: '/operator/applications' },
  { href: '/operator/events', label: 'Events', match: '/operator/events' },
  { href: '/operator/audit', label: 'Audit', match: '/operator/audit' },
  { href: '/operator/settings/webhooks', label: 'Webhooks', match: '/operator/settings' },
];

export function OperatorNav() {
  const pathname = usePathname();

  return (
    <header
      className="border-b px-4 py-3 sm:px-6"
      style={{
        borderColor: 'var(--nobc-hairline)',
        background: 'var(--nobc-ivory)',
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/operator/applications" className="text-lg font-medium tracking-tight" style={wordmarkStyle}>
          No Bad Company
        </Link>
        <nav className="flex flex-1 items-center justify-end gap-6">
          {NAV_ITEMS.map(({ href, label, match }) => {
            const active = pathname.startsWith(match);
            return (
              <Link
                key={href}
                href={href}
                className="text-sm font-medium"
                style={{
                  ...linkBase,
                  textDecoration: active ? 'underline' : 'none',
                  textDecorationColor: 'var(--nobc-red)',
                  textUnderlineOffset: '0.35em',
                }}
              >
                {label}
              </Link>
            );
          })}
          <UserButton />
        </nav>
      </div>
    </header>
  );
}
