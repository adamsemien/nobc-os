'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { SignUp, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { PREVIEW_ANSWERS } from '../_lib/preview-fixture';

const displayFont = "'PP Editorial New', Georgia, serif";
const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

// Composition CSS (media queries can't live in inline styles). Scoped under
// `.apply-door` class names, so it only affects the signed-out door layout:
//  - mobile-first: single column, copy then the "To begin" marker then the card
//  - >= 900px: two-column editorial split (read column left, action frame right),
//    the mobile marker hidden (the card is already visible to the right)
// This composes AROUND the Clerk <SignUp> card only - it never restyles the card.
const doorCss = `
.apply-door-root { background: var(--bg); min-height: 100vh; }
.apply-door {
  max-width: 1100px;
  margin: 0 auto;
  box-sizing: border-box;
  padding: clamp(48px, 8vh, 96px) clamp(24px, 5vw, 96px) 96px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}
.apply-door-read { min-width: 0; }
.apply-door-act { display: flex; justify-content: center; }
.apply-door-marker { margin-top: 40px; margin-bottom: 0; }
.apply-door-rule {
  height: 1px;
  width: 100%;
  background: var(--border);
  margin: 0 0 20px 0;
}
.apply-door-chevron { display: block; margin-top: 12px; color: var(--text-tertiary); }
@media (min-width: 900px) {
  .apply-door {
    grid-template-columns: minmax(0, 520px) minmax(360px, 460px);
    column-gap: clamp(48px, 6vw, 96px);
    align-items: start;
    padding-top: clamp(64px, 12vh, 160px);
  }
  .apply-door-marker { display: none; }
}
@media (prefers-reduced-motion: no-preference) {
  .apply-door-chevron { animation: apply-door-bob 2s ease-in-out infinite; }
}
@keyframes apply-door-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(4px); }
}
`;

/**
 * The front door for the membership application: it sells the room and creates
 * the account. There is NO NoBC membership consent here — the membership terms
 * and the email / text opt-ins now live at the END of the flow, right before
 * submit (MembershipForm's House Rules step). The only agreement on the door is
 * Clerk's own account Terms/Privacy checkbox, inside the SignUp card below.
 *
 * Signed-out visitors get the sell copy + an inline Clerk SignUp, composed as a
 * two-column editorial split on desktop (copy left, Clerk card right) that
 * collapses to a single column with a "To begin" marker on mobile. Once signed
 * in, they confirm their verified Clerk email (locked), name themselves, and
 * begin — which creates an account-linked draft and hands off to the form via
 * /apply?id=... where the existing resume path rehydrates. Consent is captured
 * later, at the House Rules step.
 */

export default function ApplyAccountGate({
  previewMode = false,
  onBegin,
}: { previewMode?: boolean; onBegin?: () => void } = {}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  const [name, setName] = useState(() =>
    previewMode ? `${PREVIEW_ANSWERS.firstName} ${PREVIEW_ANSWERS.lastName}` : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // The verified Clerk email is the single source of truth for the account-linked
  // application. Read-only in the UI; never typed. Preview mode substitutes the
  // fixture email — no real Clerk identity is read here.
  const verifiedEmail = previewMode
    ? PREVIEW_ANSWERS.email
    : user?.primaryEmailAddress?.verification?.status === 'verified'
      ? user.primaryEmailAddress.emailAddress
      : '';

  // Once signed in, pre-fill the editable name from the Clerk profile. Skipped in
  // preview so the fixture name is never overwritten by the operator's own account.
  useEffect(() => {
    if (previewMode || !isLoaded || !isSignedIn) return;
    const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    if (full) setName(full);
  }, [previewMode, isLoaded, isSignedIn, user]);

  async function beginApplication() {
    // Preview: advance into the form only — no draft is created, no Clerk call.
    if (previewMode) {
      onBegin?.();
      return;
    }
    if (!verifiedEmail || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // Create (or reuse + claim) the account-linked draft — no consent is written
      // here; the membership terms + opt-ins are captured later, at the House Rules
      // step. PR1 stamps clerkUserId because the caller is signed in; an existing
      // anonymous PENDING draft with this email is reused and claimed (zero data
      // loss). The create route forces Application.email to the verified Clerk email
      // server-side (D4c).
      const createRes = await fetch('/api/apply/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name, email: verifiedEmail }),
      });
      if (!createRes.ok) throw new Error('begin-failed');
      const { id } = await createRes.json();
      router.push(`/apply?id=${id}`);
    } catch {
      setSubmitting(false);
      setError("We couldn't start your application. Please try again.");
    }
  }

  const fieldStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'transparent',
    border: 'none',
    borderBottom: '1.5px solid var(--border)',
    borderRadius: 0,
    padding: '8px 0 12px 0',
    fontSize: 17,
    fontFamily: bodyFont,
    color: 'var(--text-primary)',
    outline: 'none',
  };
  const labelStyle: CSSProperties = {
    display: 'block',
    fontFamily: bodyFont,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-secondary)',
    marginBottom: 6,
  };
  const sellStyle: CSSProperties = {
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    margin: '0 0 18px 0',
  };
  // "To begin" marker eyebrow — same token/treatment as the hero "Membership"
  // eyebrow (red, 11px, 500, uppercase, 0.12em), reused as the action marker.
  const markerEyebrowStyle: CSSProperties = {
    display: 'block',
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--primary)',
    marginBottom: 8,
  };
  const markerLineStyle: CSSProperties = {
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.4,
    color: 'var(--text-primary)',
    margin: 0,
  };
  const beginDisabled = !verifiedEmail || submitting;

  // The editorial sell copy — one source of truth, reused by both the signed-out
  // door (near-black body) and the signed-in confirm view (muted body). Copy is
  // verbatim.
  const renderCopy = (bodyColor: string) => (
    <>
      <span style={{ fontFamily: bodyFont, fontSize: 11, fontWeight: 500, color: 'var(--primary)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
        Membership
      </span>
      <h1 style={{ fontFamily: displayFont, fontSize: 'clamp(34px, 5vw, 52px)', fontStyle: 'italic', lineHeight: 1.1, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
        Create your No Bad Company profile
      </h1>
      <p style={{ ...sellStyle, color: bodyColor }}>
        The better we know you, the better the introductions get. The right dinner. The right seat.
        The introduction you didn&apos;t see coming and didn&apos;t know you needed.
      </p>
      <p style={{ ...sellStyle, color: bodyColor }}>
        We made this fun on purpose. Part conversation, part game. At the end, you&apos;ll get your
        archetype: how you show up as your best, most authentic self in a room, so every room we
        put you in is built to bring that out of you.
      </p>
      <p style={{ ...sellStyle, color: bodyColor }}>
        Set aside 20 to 30 minutes, pour something good, and answer in your own voice. No wrong
        answers. The person we meet here is the person we build rooms around, so the more honest
        you are, the more the rooms will feel like they were made for you.
      </p>
      <p style={{ ...sellStyle, color: bodyColor }}>
        Best done on a laptop.
      </p>
    </>
  );

  // Signed-out: the account is created here. Two-column editorial split on desktop
  // (copy left, Clerk card right); single column with a "To begin" marker on mobile.
  // DOM order stays copy -> sign-in link -> marker -> card so the screen-reader
  // order matches the visual order on both breakpoints.
  if (!previewMode && isLoaded && !isSignedIn) {
    return (
      <div className="apply-door-root">
        <style>{doorCss}</style>
        <div className="apply-door">
          <div className="apply-door-read">
            {renderCopy('var(--text-primary)')}

            {/* A quiet way back for someone who already applied. */}
            <p style={{ fontFamily: bodyFont, fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 32px 0' }}>
              Already applied?{' '}
              <Link href="/sign-in" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                Sign in →
              </Link>
            </p>

            {/* Mobile-only marker (hidden >= 900px): makes it unmissable that
                creating an account is the required first step and sits just below. */}
            <div className="apply-door-marker">
              <div className="apply-door-rule" />
              <span style={markerEyebrowStyle}>To begin</span>
              <p style={markerLineStyle}>Create your account to start your profile.</p>
              <ChevronDown size={16} aria-hidden="true" className="apply-door-chevron" />
            </div>
          </div>

          {/* The Clerk card's own Terms/Privacy checkbox is the ONLY agreement on
              the door - no gate. The card stands on its own (no wrapping frame);
              the column only sizes, places, and centers it - never restructured or
              re-themed. */}
          <div className="apply-door-act">
            <SignUp routing="hash" signInUrl="/sign-in" fallbackRedirectUrl="/apply" />
          </div>
        </div>
      </div>
    );
  }

  // Signed-in (or not-yet-loaded) — or preview mode, which always uses this
  // branch: the original single-column confirm view, unchanged — locked
  // verified email + editable name + begin.
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: 'clamp(48px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
        {renderCopy('var(--text-secondary)')}

        {(previewMode || (isLoaded && isSignedIn)) && (
          <div>
            <label style={labelStyle}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={{ ...fieldStyle, marginBottom: 24 }} />
            <label style={labelStyle}>Email</label>
            <input value={verifiedEmail} readOnly style={{ ...fieldStyle, color: 'var(--text-secondary)', cursor: 'not-allowed', marginBottom: 32 }} />
            {error && <p style={{ color: 'var(--primary)', fontFamily: bodyFont, fontSize: 13, marginBottom: 16 }}>{error}</p>}
            <button
              onClick={beginApplication}
              disabled={beginDisabled}
              style={{
                fontFamily: bodyFont,
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#ffffff',
                background: 'var(--primary)',
                border: 'none',
                borderRadius: 0,
                padding: '0 32px',
                height: 52,
                width: '100%',
                maxWidth: 400,
                cursor: beginDisabled ? 'not-allowed' : 'pointer',
                opacity: beginDisabled ? 0.5 : 1,
                transition: 'opacity 150ms ease',
              }}
            >
              {submitting ? '...' : 'Start your profile'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
