'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListPlus } from 'lucide-react';

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]';

const CREATE_NEW = '__create_new__';

/** Add this Person to a STATIC (hand-curated) segment — the picker below only
 *  ever lists STATIC segments; a DYNAMIC segment's membership is computed by
 *  lib/segments/evaluate.ts, not hand-editable, so it's never offered here.
 *  Works identically for a bare lead or a promoted Person; the write is
 *  dual-pointer, never touches RSVP, never creates a Member (see
 *  app/api/operator/people/[id]/segments). */
export function AddToListButton({
  personId,
  staticSegments,
}: {
  personId: string;
  staticSegments: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [segmentId, setSegmentId] = useState('');
  const [newListName, setNewListName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creatingNew = segmentId === CREATE_NEW;

  async function submit() {
    if (saving) return;
    if (creatingNew ? !newListName.trim() : !segmentId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}/segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creatingNew ? { newListName: newListName.trim() } : { segmentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not add to list.');
        return;
      }
      setSegmentId('');
      setNewListName('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not add to list.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-text-secondary hover:text-text-primary"
      >
        <ListPlus className="h-3.5 w-3.5" />
        Add to list
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          autoFocus
          className={`${inputClass} min-w-48`}
          value={segmentId}
          onChange={(e) => setSegmentId(e.target.value)}
        >
          <option value="">Pick a list…</option>
          {staticSegments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={CREATE_NEW}>+ Create new list…</option>
        </select>
        {creatingNew ? (
          <input
            autoFocus
            className={inputClass}
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Name this list"
          />
        ) : null}
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
          disabled={saving || (creatingNew ? !newListName.trim() : !segmentId)}
          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? 'Adding…' : 'Add to list'}
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
