'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/m/home', label: 'Home' },
  { href: '/m/events', label: 'Events' },
  { href: '/m/rsvps', label: 'My RSVPs' },
  { href: '/m/profile', label: 'Profile' },
  { href: '/m/application', label: 'Application' },
];

type MemberPortalNavProps = {
  firstName?: string;
};

export default function MemberPortalNav({ firstName: _firstName }: MemberPortalNavProps) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === '/m/events') return pathname.startsWith('/m/events');
    return pathname === href;
  }

  return (
    <>
      {/* Desktop top nav */}
      <nav
        className="sticky top-0 z-20 hidden sm:block border-b"
        style={{ background: 'var(--events-canvas)', borderColor: 'var(--events-line-soft)' }}
      >
        <div className="mx-auto max-w-4xl flex items-center justify-between px-5 py-4 sm:px-8">
          <Link
            href="/m/home"
            className="text-[0.6rem] uppercase tracking-[0.2em] font-medium"
            style={{ color: 'var(--events-fg)' }}
          >
            THE{' '}
            <span style={{ color: 'var(--events-warm-accent)' }}>NO BAD</span>{' '}
            COMPANY
          </Link>
          <div className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[0.6rem] uppercase tracking-[0.2em] transition-colors"
                style={{
                  color: isActive(link.href)
                    ? 'var(--events-warm-accent)'
                    : 'var(--events-fg-soft)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive(link.href)) {
                    (e.currentTarget as HTMLElement).style.color = 'var(--events-fg)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive(link.href)) {
                    (e.currentTarget as HTMLElement).style.color = 'var(--events-fg-soft)';
                  }
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-20 flex sm:hidden border-t"
        style={{ background: 'var(--events-canvas)', borderColor: 'var(--events-line-soft)' }}
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex flex-1 flex-col items-center justify-center py-3 text-[0.55rem] uppercase tracking-[0.15em] transition-colors"
            style={{
              color: isActive(link.href)
                ? 'var(--events-warm-accent)'
                : 'var(--events-fg-soft)',
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
