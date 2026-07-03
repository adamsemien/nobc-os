'use client';

import type { ReactNode } from 'react';
import type { EventTheme } from '@/lib/page-style';

/**
 * PublicEventShell — thin layout for the public buyer page.
 *
 * Intentionally avoids importing anything from app/m/ — those modules
 * call auth() and would cause a redirect for unauthenticated visitors.
 * No member-portal nav. No org-gated components. No top wordmark strip
 * (the template carries the brand). Just a pass-through slot for the
 * event content.
 *
 * Carries the event theme attribute so the shell's own ground (overscroll,
 * loading) matches the page theme — the inner EventPageStyleWrapper sets
 * the same attribute for the template subtree.
 */
export function PublicEventShell({
  children,
  theme = 'paper',
}: {
  children: ReactNode;
  theme?: EventTheme;
}) {
  return (
    <div
      data-event-theme={theme}
      className="flex min-h-screen flex-col bg-[var(--ev-ground)] text-[var(--ev-ink)]"
    >
      {/* Event content — rendered by EventDetail → template dispatch */}
      {children}
    </div>
  );
}
