'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark } from 'lucide-react';

/** Slice 4 decision 2: a "saved view" is just a Segment (kind: DYNAMIC) built
 *  from the People-list's own filter bar — one model, not two. Takes whatever
 *  filters are currently active in the URL and saves them as a named,
 *  always-current Segment. */
export function SaveAsSegmentButton({
  filters,
}: {
  filters: { q: string; source: string; verified: string; membership: string; consent: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFilters = Boolean(
    filters.q || filters.source || filters.verified || filters.membership || filters.consent,
  );

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    const definition: Record<string, string> = {};
    if (filters.q) definition.q = filters.q;
    if (filters.source) definition.source = filters.source;
    if (filters.verified) definition.verified = filters.verified;
    if (filters.membership) definition.membership = filters.membership;
    if (filters.consent) definition.consent = filters.consent;

    try {
      const res = await fetch('/api/operator/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), kind: 'DYNAMIC', definition }),
      });
      const data = (await res.json().catch(() => null)) as { segment?: { id: string } } | null;
      if (!res.ok || !data?.segment) {
        setError('Could not save this view.');
        return;
      }
      router.push(`/operator/segments/${data.segment.id}`);
    } catch {
      setError('Could not save this view.');
    } finally {
      setSaving(false);
    }
  }

  if (!hasFilters) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      >
        <Bookmark className="h-3.5 w-3.5" />
        Save as segment
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Name this view"
        className="h-8 w-44 rounded-md border border-border bg-surface px-2.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
      />
      <button
        type="button"
        onClick={submit}
        disabled={saving || !name.trim()}
        className="inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        style={{ background: 'var(--primary)' }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-text-tertiary hover:text-text-secondary"
      >
        Cancel
      </button>
      {error ? (
        <span className="text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
