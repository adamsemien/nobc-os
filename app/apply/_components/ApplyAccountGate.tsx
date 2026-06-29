'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { SignUp, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';

const displayFont = "'PP Editorial New', Georgia, serif";
const bodyFont = "'Neue Haas Grotesk Display Pro', 'Helvetica Neue', Arial, sans-serif";

/**
 * Front account + consent gate for the membership application.
 *
 * Signed-out applicants see the relocated Terms and Conditions, the consent
 * checkboxes, and (only once they agree) an inline Clerk SignUp. Once signed in,
 * they confirm consent against their verified Clerk email (locked) and begin.
 * Beginning creates an account-linked draft, persists consent on it, and hands
 * off to the form via /apply?id=... where the existing resume path rehydrates.
 *
 * CONSENT INTEGRITY: agreedToTerms is gated on LIVE component state. The optional
 * SMS opt-in may be restored from the redirect stash, but agreedToTerms is NEVER
 * restored from it — a forged stash value cannot assert agreement. The rendered
 * checkbox the human actually ticks is the only thing that enables the account
 * step and the consentEmail write.
 */

/** Carries ONLY the optional SMS opt-in across the Clerk SignUp redirect.
 *  agreedToTerms is intentionally not stored/restored here (see above). */
const CONSENT_STASH = 'nobc-apply-consent';

export default function ApplyAccountGate() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [consentSms, setConsentSms] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // The verified Clerk email is the single source of truth for the account-linked
  // application. Read-only in the UI; never typed.
  const verifiedEmail =
    user?.primaryEmailAddress?.verification?.status === 'verified'
      ? user.primaryEmailAddress.emailAddress
      : '';

  // After the SignUp redirect, restore ONLY the optional SMS opt-in and pre-fill
  // the editable name. agreedToTerms is deliberately not restored — the human must
  // re-tick the rendered box in live state before the account step unlocks.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const raw = localStorage.getItem(CONSENT_STASH);
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v.consentSms === 'boolean') setConsentSms(v.consentSms);
      }
    } catch {
      /* ignore a malformed stash */
    }
    const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    if (full) setName(full);
  }, [isLoaded, isSignedIn, user]);

  function persistSmsPref(next: boolean) {
    try {
      localStorage.setItem(CONSENT_STASH, JSON.stringify({ consentSms: next }));
    } catch {
      /* ignore */
    }
  }

  async function beginApplication() {
    // Gate on LIVE state. A signed-in user cannot reach this write with
    // agreedToTerms=true unless the rendered checkbox is actually checked now.
    if (!agreedToTerms || !verifiedEmail || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      // Create (or reuse + claim) the account-linked draft. PR1 stamps clerkUserId
      // because the caller is signed in; an existing anonymous PENDING draft with
      // this email is reused and claimed (zero data loss). The create route forces
      // Application.email to the verified Clerk email server-side (D4c).
      const createRes = await fetch('/api/apply/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: name, email: verifiedEmail }),
      });
      if (!createRes.ok) throw new Error('begin-failed');
      const { id } = await createRes.json();

      // Persist consent on the draft so the form's unchanged handleSubmit gate
      // passes after resume. consentEmail carries "agreed to terms".
      const patchRes = await fetch(`/api/apply/membership/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentEmail: agreedToTerms, consentSms }),
      });
      if (!patchRes.ok) throw new Error('begin-failed');

      try {
        localStorage.removeItem(CONSENT_STASH);
      } catch {
        /* ignore */
      }
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
  const checkboxLabelStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    cursor: 'pointer',
    fontFamily: bodyFont,
    fontSize: 13,
    color: 'var(--text-primary)',
    lineHeight: 1.5,
  };
  const beginDisabled = !agreedToTerms || !verifiedEmail || submitting;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: 'clamp(48px, 8vw, 96px) 24px' }}>
      <div style={{ maxWidth: 560, width: '100%', margin: '0 auto' }}>
        <span style={{ fontFamily: bodyFont, fontSize: 11, fontWeight: 500, color: 'var(--primary)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
          Membership
        </span>
        <h1 style={{ fontFamily: displayFont, fontSize: 'clamp(34px, 5vw, 52px)', fontStyle: 'italic', lineHeight: 1.1, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
          Apply to No Bad Company
        </h1>
        <p style={{ fontFamily: bodyFont, fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 32px 0' }}>
          Create an account so you can save your place and return to your application from any device.
        </p>

        {/* Relocated Terms and Conditions — verbatim from the former LEGAL_STEP. */}
        <div style={{ maxHeight: 'clamp(200px, 40vw, 400px)', minHeight: 120, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', borderBottom: '1px solid var(--border)', padding: '20px 0', marginBottom: 32 }}>
          <div style={{ fontFamily: bodyFont, fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', whiteSpace: 'pre-line' }}>
            <strong style={{ display: 'block', marginBottom: 16, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>MEMBERSHIP APPLICATION - TERMS AND CONDITIONS</strong>

            <strong>1. MEMBERSHIP DISCRETION</strong>{'\n'}
            No Bad Company (&quot;NoBC&quot;, &quot;we&quot;, &quot;us&quot;) reserves the sole and absolute right to accept or decline any membership application for any reason or no reason. Submission of this application does not create any obligation on NoBC to grant membership. Membership decisions are final and not subject to appeal.{'\n\n'}

            <strong>2. AGE REQUIREMENT</strong>{'\n'}
            You must be 18 years of age or older to apply for membership. By submitting this application, you represent and warrant that you are at least 18 years old.{'\n\n'}

            <strong>3. COMMUNICATIONS CONSENT</strong>{'\n'}
            By submitting this application, you consent to receive communications from NoBC via email. You are automatically enrolled in No Bad News, our member communications program, which includes event announcements, community updates, and curated content. You may opt out of email communications at any time by contacting team@thenobadcompany.com. SMS/text message communications are optional and require separate affirmative consent below.{'\n\n'}

            <strong>4. PHOTO, VIDEO, AND CONTENT RELEASE</strong>{'\n'}
            By submitting this application and participating in NoBC events and activities, you grant NoBC an irrevocable, royalty-free, worldwide license to use, reproduce, distribute, and display photographs, video recordings, and other content that may capture your likeness, image, or voice in connection with NoBC events, marketing materials, social media, and other promotional purposes. This license survives termination of membership.{'\n\n'}

            <strong>5. DATA AND PRIVACY</strong>{'\n'}
            NoBC collects and stores the personal information you provide in this application for membership administration purposes. We do not sell your personal data to third parties. We retain your information for 24 months following the date of your application or the termination of your membership, whichever is later. You may request deletion of your data by contacting team@thenobadcompany.com. Certain information may be retained as required by applicable law.{'\n\n'}

            <strong>6. LIMITATION OF LIABILITY</strong>{'\n'}
            To the maximum extent permitted by applicable law, NoBC and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or relating to your membership application, membership, or participation in NoBC events or activities.{'\n\n'}

            <strong>7. GOVERNING LAW AND VENUE</strong>{'\n'}
            This agreement shall be governed by and construed in accordance with the laws of the State of Texas. Any dispute arising under this agreement shall be resolved exclusively in the courts of Travis County, Texas.
          </div>
        </div>

        {/* SMS opt-in (optional) — verbatim label. */}
        <div style={{ marginBottom: 16 }}>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={consentSms} onChange={e => { setConsentSms(e.target.checked); persistSmsPref(e.target.checked); }} style={{ marginTop: 2, accentColor: 'var(--primary)' }} />
            I&apos;d like to receive event reminders and updates via text message (optional). Message and data rates may apply. Reply STOP to opt out.
          </label>
        </div>

        {/* Agree to terms — verbatim label. Live state gates the account step. */}
        <div style={{ marginBottom: 32 }}>
          <label style={checkboxLabelStyle}>
            <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--primary)' }} />
            I have read and agree to the terms above
          </label>
        </div>

        {/* Signed-out: reveal account creation ONLY after the terms box is checked. */}
        {isLoaded && !isSignedIn && agreedToTerms && (
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
