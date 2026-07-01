'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { SignUp, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Mic } from 'lucide-react';

const displayFont = "'PP Editorial New', Georgia, serif";
const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

/**
 * The front door for the membership application: it sells the room and creates
 * the account. There is NO NoBC membership consent here — the membership terms
 * and the email / text opt-ins now live at the END of the flow, right before
 * submit (MembershipForm's House Rules step). The only agreement on the door is
 * Clerk's own account Terms/Privacy checkbox, inside the SignUp card below.
 *
 * Signed-out visitors get the sell copy + an inline Clerk SignUp (no gate). Once
 * signed in, they confirm their verified Clerk email (locked), name themselves,
 * and begin — which creates an account-linked draft and hands off to the form via
 * /apply?id=... where the existing resume path rehydrates. Consent is captured
 * later, at the House Rules step.
 */

export default function ApplyAccountGate() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // The verified Clerk email is the single source of truth for the account-linked
  // application. Read-only in the UI; never typed.
  const verifiedEmail =
    user?.primaryEmailAddress?.verification?.status === 'verified'
      ? user.primaryEmailAddress.emailAddress
      : '';

  // Once signed in, pre-fill the editable name from the Clerk profile.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    if (full) setName(full);
  }, [isLoaded, isSignedIn, user]);

  async function beginApplication() {
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
  // "Before you start" reuses the hero "Membership" eyebrow's typography, but muted
  // (text-secondary) so it reads as a quiet sub-label instead of a second brand-red
  // eyebrow competing with the hero.
  const eyebrowMutedStyle: CSSProperties = {
    display: 'block',
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    margin: '0 0 12px 0',
  };
  const tipListStyle: CSSProperties = {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 28px 0',
  };
  const tipStyle: CSSProperties = {
    display: 'flex',
    gap: 10,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    margin: '0 0 12px 0',
  };
  const dashStyle: CSSProperties = { flexShrink: 0, color: 'var(--text-tertiary)' };
  // Only the lead phrase is emphasized, and only by weight - 500 is the emphasis
  // weight used elsewhere in this file (eyebrow, CTA, sign-in link).
  const leadStyle: CSSProperties = { fontWeight: 500 };
  // Sized to the 15px tip line-height so the mic sits with the text, not as a badge.
  const micIconStyle: CSSProperties = { verticalAlign: '-0.15em', marginRight: 6 };
  const beginDisabled = !verifiedEmail || submitting;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: 'clamp(48px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
        <span style={{ fontFamily: bodyFont, fontSize: 11, fontWeight: 500, color: 'var(--primary)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
          Membership
        </span>
        <h1 style={{ fontFamily: displayFont, fontSize: 'clamp(34px, 5vw, 52px)', fontStyle: 'italic', lineHeight: 1.1, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
          Apply to No Bad Company
        </h1>
        <p style={sellStyle}>
          Membership is by application, and by invitation. The room is small on purpose - built from
          people worth spending an evening with, chosen one at a time.
        </p>
        <span style={eyebrowMutedStyle}>Before you start</span>
        <ul style={tipListStyle}>
          <li style={tipStyle}>
            <span aria-hidden="true" style={dashStyle}>-</span>
            <span>
              <strong style={leadStyle}>Set aside about 30 minutes.</strong> This is a real
              application - most questions ask you to write a few sentences, not tick a box.
            </span>
          </li>
          <li style={tipStyle}>
            <span aria-hidden="true" style={dashStyle}>-</span>
            <span>
              <Mic size={15} strokeWidth={1.75} aria-hidden="true" style={micIconStyle} />
              <strong style={leadStyle}>Use your voice.</strong> Tap the mic and just talk - the
              application was built for it. Don&apos;t overthink your answers.
            </span>
          </li>
          <li style={tipStyle}>
            <span aria-hidden="true" style={dashStyle}>-</span>
            <span>
              <strong style={leadStyle}>Create an account first</strong> so your progress saves and
              you can pick up from any device.
            </span>
          </li>
        </ul>

        {/* Signed-out only: a quiet way back for someone who already applied. */}
        {isLoaded && !isSignedIn && (
          <p style={{ fontFamily: bodyFont, fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 32px 0' }}>
            Already applied?{' '}
            <Link href="/sign-in" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
              Sign in →
            </Link>
          </p>
        )}

        {/* Signed-out: the account is created here. The Clerk card's own Terms/Privacy
            checkbox is the ONLY agreement on the door — no gate. */}
        {isLoaded && !isSignedIn && (
          <SignUp routing="hash" signInUrl="/sign-in" fallbackRedirectUrl="/apply" />
        )}

        {/* Signed-in: locked verified email + editable name + begin. */}
        {isLoaded && isSignedIn && (
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
              {submitting ? '...' : 'begin application'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
