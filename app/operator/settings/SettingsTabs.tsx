'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SETTINGS_TABS = [
  { href: '/operator/settings/theme', label: 'Theme' },
  { href: '/operator/settings/webhooks', label: 'Webhooks' },
  { href: '/operator/settings/lists', label: 'Lists' },
  { href: '/operator/settings/bug-reports', label: 'Bug Reports' },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b px-4 sm:px-6" style={{ borderColor: 'var(--border)' }}>
      <nav className="flex gap-0" aria-label="Settings sections">
        {SETTINGS_TABS.map(({ href, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`px-3 py-3 text-sm font-medium transition-colors font-[family-name:var(--font-dm-sans)] ${
                active
                  ? 'text-text-primary underline decoration-[var(--primary)] underline-offset-[6px]'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              style={
                active
                  ? { textDecorationColor: 'var(--primary)', textDecorationThickness: '2px' }
                  : {}
              }
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
