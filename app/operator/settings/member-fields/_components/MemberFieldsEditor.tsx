'use client';

/**
 * Member field definition editor (member-intelligence PR3 Slice 2, F5). ADMIN CRUD over the
 * FieldDefinition registry via /api/operator/settings/member-fields. Mirrors the application
 * form builder: add/rename/retype rows, set select options + sponsor visibility, remove
 * (soft-delete server-side). Reserved/firewall keys (archetype/psychographic) are blocked here
 * AND at the API. Design tokens only.
 */
import { useEffect, useState } from 'react';
import { isReservedKey, slugifyFieldKey } from '@/lib/member-editable';

const FIELD_TYPES = ['text', 'textarea', 'select', 'url', 'checkbox'] as const;
type FieldType = (typeof FIELD_TYPES)[number];

interface FieldRow {
  id?: string;
  stableKey?: string;
  name: string;
  type: FieldType;
  options: string[];
  sponsorVisible: boolean;
}

export function MemberFieldsEditor() {
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/operator/settings/member-fields', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load fields'))))
      .then((d: { fields: FieldRow[] }) => {
        if (active) setRows(d.fields ?? []);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function update(i: number, patch: Partial<FieldRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  function addRow() {
    setRows((prev) => [...prev, { name: '', type: 'text', options: [], sponsorVisible: false }]);
    setSaved(false);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function save() {
    setError(null);
    const named = rows.filter((r) => r.name.trim());
    const reserved = named.filter((r) => isReservedKey(slugifyFieldKey(r.name)));
    if (reserved.length) {
      setError(`Reserved field name(s) not allowed: ${reserved.map((r) => r.name).join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/operator/settings/member-fields', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fields: named.map((r) => ({
            id: r.id,
            name: r.name.trim(),
            type: r.type,
            options: r.type === 'select' ? r.options.filter(Boolean) : [],
            sponsorVisible: r.sponsorVisible,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Save failed');
      }
      const refreshed = await fetch('/api/operator/settings/member-fields', { credentials: 'include' }).then((r) =>
        r.json(),
      );
      setRows(refreshed.fields ?? named);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="mt-6 text-sm text-text-secondary">Loading…</p>;
  }

  return (
    <div className="mt-6 max-w-3xl space-y-4">
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-sm text-text-tertiary">
            No member fields yet. Add one to start capturing custom data on every member record.
          </p>
        ) : null}

        {rows.map((row, i) => (
          <div key={row.id ?? `new-${i}`} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Field name"
                className="min-w-[12rem] flex-1 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                value={row.type}
                onChange={(e) => update(i, { type: e.target.value as FieldType })}
                className="rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={row.sponsorVisible}
                  onChange={(e) => update(i, { sponsorVisible: e.target.checked })}
                  className="accent-[var(--primary)]"
                />
                Sponsor-visible
              </label>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger-soft"
              >
                Remove
              </button>
            </div>
            {row.type === 'select' ? (
              <input
                value={row.options.join(', ')}
                onChange={(e) => update(i, { options: e.target.value.split(',').map((o) => o.trim()) })}
                placeholder="Options, comma-separated"
                className="mt-2 w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : null}
          </div>
        ))}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {saved ? <p className="text-sm text-success">Saved.</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-raised"
        >
          Add field
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save fields'}
        </button>
      </div>
    </div>
  );
}
