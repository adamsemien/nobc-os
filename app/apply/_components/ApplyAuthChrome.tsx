'use client';

import { useUser, UserButton } from '@clerk/nextjs';

/**
 * Auth chrome for /apply: sign-out + switch/manage-account for a signed-in
 * applicant, across every apply surface (door, form, received, decided).
 *
 * Client-gated via useUser() — the SAME hook ApplyAccountGate uses — so the apply
 * layout can stay a pure sync Server Component. (Making that layout async and
 * calling server auth() broke the signed-out door's Clerk <SignUp> mount; the
 * gating therefore lives here on the client instead.) Renders nothing for
 * anonymous or not-yet-loaded visitors. No <SignedIn>/<SignedOut> (not exported
 * in this Clerk install) and no server auth().
 */
export default function ApplyAuthChrome() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded || !isSignedIn) return null;

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50 }}>
      <UserButton />
    </div>
  );
}
