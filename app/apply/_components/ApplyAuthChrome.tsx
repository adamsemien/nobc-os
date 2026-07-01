'use client';

import { useUser } from '@clerk/nextjs';
import ZoneSignOut from '@/components/auth/ZoneSignOut';

const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

/**
 * Auth chrome for /apply: a visible sign-out for a signed-in applicant, on every
 * apply surface (door, form, received, decided). Client-gated via useUser() (the
 * same hook ApplyAccountGate uses) so the apply layout can stay a sync Server
 * Component. Renders nothing for anonymous / not-yet-loaded visitors.
 *
 * Sign-out routes back to /apply (not the global /signed-out): an applicant who
 * signs out mid-flow is most likely switching accounts, and /apply lets them
 * resume or sign in again. Uses the shared ZoneSignOut control — afterSignOutUrl
 * is not a valid <UserButton> prop in this Clerk version.
 */
export default function ApplyAuthChrome() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded || !isSignedIn) return null;

  return (
    // Bottom-right, above app chrome (z:100). Pinned to the BOTTOM because
    // MembershipForm's opaque sticky <nav> owns the top strip (top:0, h:56, z:50)
    // and paints over a top-anchored control on the form route; the bottom-right
    // corner is clear on every apply surface (door, form, thanks).
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100 }}>
      <ZoneSignOut
        redirectUrl="/apply"
        ariaLabel="Sign out"
        style={{
          fontFamily: bodyFont,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 0,
          padding: '8px 14px',
          minHeight: 40,
          cursor: 'pointer',
        }}
      >
        Sign out
      </ZoneSignOut>
    </div>
  );
}
