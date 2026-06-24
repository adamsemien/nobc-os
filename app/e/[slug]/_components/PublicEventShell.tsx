'use client';

import type { ReactNode } from 'react';

/**
 * PublicEventShell — thin layout for the public buyer page.
 *
 * Intentionally avoids importing anything from app/m/ — those modules
 * call auth() and would cause a redirect for unauthenticated visitors.
 * No member-portal nav. No org-gated components. No top wordmark strip
 * (the template carries the brand). Just a pass-through slot for the
 * event content.
 */
export function PublicEventShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      {/* Event content — rendered by EventDetail → template dispatch */}
      {children}
    </div>
  );
}
