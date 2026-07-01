'use client';

import { useClerk } from '@clerk/nextjs';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Reusable per-zone sign-out control. Each zone passes its own post-sign-out
 * destination via `redirectUrl` — Clerk exposes a single global afterSignOutUrl
 * that can't tell an applicant from an operator, so the per-call
 * `signOut({ redirectUrl })` is how each zone routes somewhere sensible:
 *   apply  → '/apply'      (applicant can resume / sign into another account)
 *   member → '/signed-out' (neutral confirmation)
 * afterSignOutUrl is NOT a valid <UserButton> prop in @clerk/nextjs 7.3.3, which
 * is why this control exists. Styling is left to the caller (className/style) so
 * the same control fits both the apply chrome and the member nav.
 */
export default function ZoneSignOut({
  redirectUrl,
  children,
  className,
  style,
  ariaLabel,
}: {
  redirectUrl: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => {
        void signOut({ redirectUrl });
      }}
      className={className}
      style={style}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
