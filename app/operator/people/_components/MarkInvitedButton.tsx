'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

const inputClass =
  'h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]';

/** Slice 5 — mark this Person invited to an event. Works identically for a
 *  bare lead or a promoted Person; the write is dual-pointer, never touches
 *  RSVP, never creates a Member (see app/api/operator/people/[id]/invite). */
export function MarkInvitedButton({
  personId,
  eventOptions,
}: {
  personId: string;
  eventOptions: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!eventId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not mark invited.');
        return;
      }
      setEventId('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('Could not mark invited.');
    } finally {
      setSaving(false);
    }
  }

  if (eventOptions.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-text-secondary hover:text-text-primary"
      >
        <Plus className="h-3.5 w-3.5" />
        Mark invited
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          autoFocus
          className={`${inputClass} min-w-48`}
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="">Pick an event…</option>
          {eventOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
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
          disabled={saving || !eventId}
          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--primary)' }}
        >
          {saving ? 'Marking…' : 'Mark invited'}
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
