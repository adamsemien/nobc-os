'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]';

export function AddPersonSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);

  const hasAnything = Boolean(
    firstName.trim() || lastName.trim() || email.trim() || phone.trim(),
  );

  async function submit() {
    if (!hasAnything || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/operator/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName || null,
          lastName: lastName || null,
          email: email || null,
          phone: phone || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; flaggedDuplicate?: boolean }
        | null;
      if (!res.ok) {
        setError(data?.error ?? 'Could not add person.');
        return;
      }
      setFlagged(Boolean(data?.flaggedDuplicate));
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not add person.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => {
            setFlagged(false);
            setOpen(true);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          style={{ background: 'var(--primary)' }}
        >
          <Plus className="h-4 w-4" />
          Add person
        </button>
        {flagged ? (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Added — flagged as a possible duplicate.{' '}
            <Link href="/operator/people/merge" className="font-medium underline">
              Review in the merge queue
            </Link>
            .
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl rounded-md border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">First name</span>
          <input
            autoFocus
            className={inputClass}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Ada"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Last name</span>
          <input
            className={inputClass}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Lovelace"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Email</span>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="ada@example.com"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">Phone</span>
          <input
            type="tel"
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="+1 555 000 0000"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !hasAnything}
          className="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? 'Adding…' : 'Add person'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
