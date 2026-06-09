'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d\s\-().+ ]{10,}$/;

type FieldErrors = { name?: string; email?: string; phone?: string };

export function WalkinModal({
  open,
  onClose,
  eventSlug,
  workspaceSlug,
  token,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  eventSlug: string;
  workspaceSlug: string;
  /** Event-scoped check-in token, minted server-side for a STAFF+ operator. */
  token: string | null;
  onSuccess: (memberName: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [plusOne, setPlusOne] = useState(false);
  const [plusOneName, setPlusOneName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  if (!open) return null;

  function validate(): FieldErrors {
    const fe: FieldErrors = {};
    if (!name.trim()) fe.name = 'Required';
    else if (name.trim().length > 100) fe.name = 'Max 100 characters';
    if (!email.trim()) fe.email = 'Required';
    else if (!EMAIL_RE.test(email.trim())) fe.email = 'Enter a valid email';
    if (phone.trim() && !PHONE_RE.test(phone.trim())) fe.phone = 'Enter a valid phone';
    return fe;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fe = validate();
    setFieldErrors(fe);
    if (Object.keys(fe).length > 0) {
      setError(null);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/check-in/walkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          eventSlug,
          workspaceSlug,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          plusOne,
          plusOneName: plusOne ? plusOneName.trim() || undefined : undefined,
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof error === 'string' ? error : 'Could not add walk-in');
      }
      onSuccess(name.trim());
      setName('');
      setEmail('');
      setPhone('');
      setPlusOne(false);
      setPlusOneName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add walk-in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#161616',
          color: '#f5f5f5',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 20,
          paddingBottom: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Add walk-in</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <FormRow label="Name *" error={fieldErrors.name}>
          <input
            type="text"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setFieldErrors(validate())}
            autoComplete="name"
            autoFocus
            style={inputStyle}
          />
        </FormRow>

        <FormRow label="Email *" error={fieldErrors.email}>
          <input
            type="email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setFieldErrors(validate())}
            autoComplete="email"
            style={inputStyle}
          />
        </FormRow>

        <FormRow label="Phone (optional)" error={fieldErrors.phone}>
          <input
            type="tel"
            value={phone}
            maxLength={30}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setFieldErrors(validate())}
            autoComplete="tel"
            style={inputStyle}
          />
        </FormRow>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={plusOne}
            onChange={(e) => setPlusOne(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#B22E21' }}
          />
          Bringing a plus-one?
        </label>

        {plusOne ? (
          <FormRow label="Plus-one name">
            <input
              type="text"
              value={plusOneName}
              onChange={(e) => setPlusOneName(e.target.value)}
              style={inputStyle}
            />
          </FormRow>
        ) : null}

        {error ? (
          <p style={{ color: '#ff8a80', fontSize: 13, margin: 0 }}>{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || !name.trim() || !email.trim()}
          style={{
            marginTop: 4,
            height: 48,
            borderRadius: 10,
            border: 'none',
            background: '#B22E21',
            color: 'white',
            fontSize: 16,
            fontWeight: 600,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting || !name.trim() || !email.trim() ? 0.6 : 1,
          }}
        >
          {submitting ? 'Adding…' : 'Add & check in'}
        </button>
      </form>
    </div>
  );
}

function FormRow({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888' }}>
        {label}
      </span>
      {children}
      {error ? (
        <span role="alert" style={{ fontSize: 12, color: '#ff8a80' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 44,
  borderRadius: 8,
  border: '1px solid #333',
  background: '#0a0a0a',
  color: '#f5f5f5',
  padding: '0 12px',
  fontSize: 16,
  outline: 'none',
};
