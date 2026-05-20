'use client';

import { useState } from 'react';
import type { TierNames } from '@/lib/score-display';

export function TierNamesEditor({
  initial,
  defaults,
}: {
  initial: TierNames;
  defaults: TierNames;
}) {
  const [values, setValues] = useState<TierNames>(initial);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  async function save() {
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch('/api/operator/settings/tiers', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setFlash({ kind: 'ok', msg: 'Saved.' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed';
      setFlash({ kind: 'err', msg });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 3000);
    }
  }

  function resetToDefaults() {
    setValues(defaults);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="space-y-4">
          <Row
            label="Top tier"
            hint="Score 73-100 — your strongest signal members."
            value={values.top}
            placeholder={defaults.top}
            onChange={(v) => setValues({ ...values, top: v })}
          />
          <Row
            label="Middle tier"
            hint="Score 53-72 — solid members, the bulk of your community."
            value={values.mid}
            placeholder={defaults.mid}
            onChange={(v) => setValues({ ...values, mid: v })}
          />
          <Row
            label="Lower tier"
            hint="Score 0-52 — considering, watching, not approved yet."
            value={values.low}
            placeholder={defaults.low}
            onChange={(v) => setValues({ ...values, low: v })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={resetToDefaults}
          className="text-sm text-text-secondary underline-offset-2 hover:underline"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-3">
          {flash ? (
            <span
              className="text-xs"
              style={{ color: flash.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}
            >
              {flash.msg}
            </span>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={40}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
      />
      <p className="text-xs text-text-secondary">{hint}</p>
    </div>
  );
}
