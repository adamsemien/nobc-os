'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * PublicEventShell — thin layout for the public buyer page.
 *
 * Intentionally avoids importing anything from app/m/ — those modules
 * call auth() and would cause a redirect for unauthenticated visitors.
 * No member-portal nav. No org-gated components. Just the wordmark and
 * a pass-through slot for the event content.
 */
export function PublicEventShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      {/* Plain wordmark header — matches TemplateMinimal's header markup exactly */}
      <header className="mx-auto w-full max-w-xl px-6 pt-10 text-center">
        <Link
          href="/"
          className="text-[10px] uppercase tracking-[0.3em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
        >
          <span className="text-[var(--nobc-red)]">NO BAD </span>
          <span>COMPANY</span>
        </Link>
      </header>

      {/* Event content — rendered by EventDetail → template dispatch */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
