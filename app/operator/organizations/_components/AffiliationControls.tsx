'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]';

/** Add an affiliation from either side (STAFF): the anchor id is fixed by the
 *  page, the operator picks the other side. Shared by the Organization detail
 *  (pick a person) and the Person detail (pick an organization). */
export function AddAffiliationForm({
  organizationId,
  personId,
  options,
  pickLabel,
}: {
  /** Fixed organization (Organization detail) — pick a person. */
  organizationId?: string;
  /** Fixed person (Person detail) — pick an organization. */
  personId?: string;
  options: Array<{ id: string; label: string }>;
  pickLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState('');
  const [role, setRole] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!pickedId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/operator/affiliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organizationId ?? pickedId,
          personId: personId ?? pickedId,
          role: role || null,
          isPrimary,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not add affiliation.');
        return;
      }
      setPickedId('');
      setRole('');
      setIsPrimary(false);
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not add affiliation.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-text-secondary hover:text-text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        Add affiliation
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          autoFocus
          className={`${inputClass} min-w-44`}
          value={pickedId}
          onChange={(e) => setPickedId(e.target.value)}
        >
          <option value="">{pickLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={`${inputClass} w-40`}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role (optional)"
        />
        <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
          />
          Primary contact
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !pickedId}
          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Detach an affiliation (STAFF). Low-stakes and re-addable, so no modal. */
export function RemoveAffiliationButton({ affiliationId }: { affiliationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/operator/affiliations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: affiliationId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      title="Remove affiliation"
      aria-label="Remove affiliation"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-50"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
