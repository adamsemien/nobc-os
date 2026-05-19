'use client';

import { useState, FormEvent } from 'react';

type ProfileFormProps = {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: string;
    approvedAt: string | null;
  };
  application: { city: string | null; neighborhood: string | null } | null;
};

function formatJoinDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (status) {
    case 'APPROVED':
      bg = 'var(--success-soft)';
      color = 'var(--success)';
      label = 'Member';
      break;
    case 'PENDING':
      bg = 'var(--warning-soft)';
      color = 'var(--warning)';
      label = 'Pending Review';
      break;
    case 'WAITLISTED':
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = 'Waitlisted';
      break;
    case 'REJECTED':
      bg = 'var(--danger-soft)';
      color = 'var(--danger)';
      label = 'Not Approved';
      break;
    default:
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = 'Guest';
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em]"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

const inputClass =
  'w-full rounded border px-3 py-2.5 text-sm focus:outline-none transition-colors';
const labelClass = 'text-[0.65rem] uppercase tracking-[0.15em] mb-1.5 block';

export default function ProfileForm({ member, application }: ProfileFormProps) {
  const [firstName, setFirstName] = useState(member.firstName ?? '');
  const [lastName, setLastName] = useState(member.lastName ?? '');
  const [phone, setPhone] = useState(member.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      const res = await fetch('/api/m/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, phone: phone || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data?.error ? JSON.stringify(data.error) : 'Something went wrong.');
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-normal"
          style={{
            color: 'var(--events-fg)',
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
          }}
        >
          Profile
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--events-fg-quiet)' }}>
          Member since {formatJoinDate(member.createdAt)}
        </p>
      </div>

      {/* Status */}
      <div className="mb-6">
        <StatusBadge status={member.status} />
      </div>

      {/* Email (read-only) */}
      <div
        className="rounded-lg border p-4 mb-6"
        style={{ borderColor: 'var(--events-line-soft)', background: 'var(--events-canvas-raised)' }}
      >
        <p className={labelClass} style={{ color: 'var(--events-fg-quiet)' }}>
          Email
        </p>
        <p className="text-sm" style={{ color: 'var(--events-fg-soft)' }}>
          {member.email}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--events-fg-quiet)' }}>
          Managed by Clerk — contact support to change.
        </p>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass} style={{ color: 'var(--events-fg-quiet)' }}>
            First Name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
            style={{
              borderColor: 'var(--events-line-soft)',
              background: 'var(--events-canvas-raised)',
              color: 'var(--events-fg)',
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--events-warm-accent)';
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--events-line-soft)';
            }}
          />
        </div>

        <div>
          <label className={labelClass} style={{ color: 'var(--events-fg-quiet)' }}>
            Last Name
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={inputClass}
            style={{
              borderColor: 'var(--events-line-soft)',
              background: 'var(--events-canvas-raised)',
              color: 'var(--events-fg)',
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--events-warm-accent)';
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--events-line-soft)';
            }}
          />
        </div>

        <div>
          <label className={labelClass} style={{ color: 'var(--events-fg-quiet)' }}>
            Phone
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="Optional"
            style={{
              borderColor: 'var(--events-line-soft)',
              background: 'var(--events-canvas-raised)',
              color: 'var(--events-fg)',
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--events-warm-accent)';
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--events-line-soft)';
            }}
          />
        </div>

        {/* Application read-only fields */}
        {application && (application.city || application.neighborhood) && (
          <div
            className="rounded-lg border p-4 mt-2"
            style={{
              borderColor: 'var(--events-line-soft)',
              background: 'var(--events-canvas-raised)',
            }}
          >
            <p className="text-[0.6rem] uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--events-fg-quiet)' }}>
              From your application
            </p>
            {application.city && (
              <div className="mb-2">
                <p className={labelClass} style={{ color: 'var(--events-fg-quiet)' }}>City</p>
                <p className="text-sm" style={{ color: 'var(--events-fg-soft)' }}>{application.city}</p>
              </div>
            )}
            {application.neighborhood && (
              <div>
                <p className={labelClass} style={{ color: 'var(--events-fg-quiet)' }}>Neighborhood</p>
                <p className="text-sm" style={{ color: 'var(--events-fg-soft)' }}>{application.neighborhood}</p>
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded px-5 py-2.5 text-[0.65rem] uppercase tracking-[0.15em] font-medium transition-opacity disabled:opacity-50"
            style={{
              background: 'var(--events-warm-accent)',
              color: 'var(--events-canvas)',
              borderRadius: '6px',
            }}
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
          </button>

          {error && (
            <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
