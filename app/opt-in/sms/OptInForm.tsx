'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * SMS opt-in form. The consent checkbox is UNCHECKED by default and gates
 * nothing but itself — consent is a distinct affirmative act, never a
 * condition of anything else. The disclosure block renders adjacent to the
 * action, never behind a link. Its text is display-only here; the server
 * rebuilds the same versioned text at submit and snapshots THAT into the
 * artifact (the client copy is never trusted).
 */

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'done'; alreadySubscribed: boolean; suppressed: boolean }
  | { phase: 'error'; message: string };

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  color: 'var(--text-primary)',
  background: 'var(--surface-elevated, transparent)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-muted, var(--text-tertiary))',
  marginBottom: 6,
};

export function OptInForm({
  token,
  knownPerson,
  disclosureText,
  disclosureVersion,
}: {
  token: string | null;
  knownPerson: boolean;
  disclosureText: string;
  disclosureVersion: string;
}) {
  const [phone, setPhone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false); // UNCHECKED by default — always.
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<SubmitState>({ phase: 'idle' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || state.phase === 'saving') return;
    setState({ phase: 'saving' });
    try {
      const res = await fetch('/api/opt-in/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          postalCode,
          consent: true,
          ...(knownPerson ? {} : { firstName, lastName, email }),
          ...(token ? { token } : {}),
          website,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; alreadySubscribed?: boolean; suppressed?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setState({ phase: 'error', message: data?.error ?? 'Something went wrong. Please try again.' });
        return;
      }
      setState({
        phase: 'done',
        alreadySubscribed: Boolean(data.alreadySubscribed),
        suppressed: Boolean(data.suppressed),
      });
    } catch {
      setState({ phase: 'error', message: 'Something went wrong. Please try again.' });
    }
  }

  if (state.phase === 'done') {
    return (
      <div style={{ marginTop: 40 }}>
        <h2
          style={{
            fontFamily: "'PP Editorial New', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 28,
            margin: 0,
          }}
        >
          {/* CHLOE: confirmation headline. Placeholder only. */}
          {state.alreadySubscribed ? 'You were already on the list.' : "You're on the list."}
        </h2>
        {state.suppressed ? (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', marginTop: 14 }}>
            One more step: you previously opted out of texts from this number, so your carrier is
            still blocking delivery. Text <strong>START</strong> to the number in the fine print
            below to resume receiving messages.
          </p>
        ) : (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', marginTop: 14 }}>
            {/* CHLOE: confirmation body. Placeholder only. */}
            We&apos;ll only text when there&apos;s something worth knowing. Reply STOP any time to
            opt out.
          </p>
        )}
        <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)', marginTop: 24 }}>
          {disclosureText}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 36 }} noValidate>
      {!knownPerson && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="optin-first">
                First name
              </label>
              <input
                id="optin-first"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="optin-last">
                Last name
              </label>
              <input
                id="optin-last"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle} htmlFor="optin-email">
              Email <span style={{ opacity: 0.6, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              id="optin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>
        </>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle} htmlFor="optin-phone">
          Mobile number
        </label>
        <input
          id="optin-phone"
          type="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(512) 555-0123"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle} htmlFor="optin-zip">
          ZIP code
        </label>
        <input
          id="optin-zip"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          required
          maxLength={10}
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="78701"
          style={inputStyle}
        />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          {/* CHLOE: zip benefit line. Placeholder only. */}
          So we only text at reasonable hours where you are.
        </p>
      </div>

      {/* Honeypot — visually hidden, humans never fill it. */}
      <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
        <label htmlFor="optin-website">Website</label>
        <input
          id="optin-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {/* ── Consent action + mandated disclosure block, adjacent, never behind a link ── */}
      <label
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          cursor: 'pointer',
          padding: '14px 14px',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          style={{ marginTop: 3, accentColor: 'var(--primary)' }}
        />
        <span style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          {disclosureText.replace(/ See our Terms of Service.*$/, '')}{' '}
          See our <Link href="/terms" style={{ textDecoration: 'underline', color: 'inherit' }}>Terms of Service</Link> and{' '}
          <Link href="/privacy" style={{ textDecoration: 'underline', color: 'inherit' }}>Privacy Policy</Link>.
        </span>
      </label>

      {state.phase === 'error' && (
        <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: 14 }}>{state.message}</p>
      )}

      <button
        type="submit"
        disabled={!consent || state.phase === 'saving'}
        style={{
          marginTop: 20,
          width: '100%',
          padding: '13px 16px',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'var(--on-primary)',
          background: 'var(--primary)',
          border: 'none',
          borderRadius: 10,
          cursor: !consent || state.phase === 'saving' ? 'not-allowed' : 'pointer',
          opacity: !consent || state.phase === 'saving' ? 0.5 : 1,
        }}
      >
        {state.phase === 'saving' ? 'Saving…' : 'Sign me up'}
      </button>

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
        Disclosure {disclosureVersion}. Consent is not a condition of any purchase or membership.
      </p>
    </form>
  );
}
