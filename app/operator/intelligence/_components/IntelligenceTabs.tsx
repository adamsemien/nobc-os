'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { key: 'community' | 'sponsors' | 'recap'; label: string; href: string };

export function IntelligenceTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs: Tab[] = [
    { key: 'community', label: 'Community', href: '/operator/intelligence' },
  ];
  if (isAdmin) {
    tabs.push({ key: 'sponsors', label: 'Sponsors', href: '/operator/intelligence/sponsor' });
    tabs.push({ key: 'recap', label: 'Recap Studio', href: '/operator/intelligence/recap' });
  }

  const isRecap = pathname.startsWith('/operator/intelligence/recap');
  const isSponsors = pathname.startsWith('/operator/intelligence/sponsor');
  const activeKey: Tab['key'] = isRecap ? 'recap' : isSponsors ? 'sponsors' : 'community';

  return (
    <nav
      aria-label="Intelligence sections"
      className="mb-6 flex items-center gap-1 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className="relative px-3 py-2.5 text-[13px] font-medium transition-colors"
            style={{
              color: active ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            {t.label}
            <span
              aria-hidden
              className="absolute inset-x-2 -bottom-px h-[2px]"
              style={{
                background: active ? 'var(--primary)' : 'transparent',
              }}
            />
          </Link>
        );
      })}
    </nav>
  );
}
