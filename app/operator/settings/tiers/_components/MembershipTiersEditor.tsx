'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { TierRow } from '@/app/api/operator/tiers/route';

type FieldErrors = Record<string, string | undefined>;

export function MembershipTiersEditor() {
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMinScore, setNewMinScore] = useState('');
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const load = useCallback(async () => {
    const res = await fetch('/api/operator/tiers', { credentials: 'include' });
    if (!res.ok) return;
    const data = (await res.json()) as { tiers: TierRow[] };
    setTiers(data.tiers);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showFlash = (kind: 'ok' | 'err', msg: string) => {
    setFlash({ kind, msg });
    window.setTimeout(() => setFlash(null), 3000);
  };

  const update = useCallback(
    async (id: string, patch: Partial<TierRow>) => {
      setPending(true);
      try {
        const res = await fetch(`/api/operator/tiers/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          showFlash('err', 'Could not save.');
        } else {
          showFlash('ok', 'Saved.');
          await load();
        }
      } finally {
        setPending(false);
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this tier?')) return;
      setPending(true);
      try {
        const res = await fetch(`/api/operator/tiers/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) showFlash('err', 'Could not delete.');
        else {
          showFlash('ok', 'Deleted.');
          await load();
        }
      } finally {
        setPending(false);
      }
    },
    [load],
  );

  const move = useCallback(
    async (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= tiers.length) return;
      const next = [...tiers];
      [next[idx], next[target]] = [next[target], next[idx]];
      setTiers(next);
      const res = await fetch('/api/operator/tiers/reorder', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((t) => t.id) }),
      });
      if (!res.ok) {
        showFlash('err', 'Reorder failed.');
        await load();
      }
    },
    [tiers, load],
  );

  const add = useCallback(async () => {
    const name = newName.trim();
    const fe: FieldErrors = {};
    if (!name) fe.name = 'Required';
    let minScore: number | null = null;
    if (newMinScore.trim()) {
      const n = Number(newMinScore);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        fe.minScore = '0–1';
      } else {
        minScore = n;
      }
    }
    setErrors(fe);
    if (Object.keys(fe).length > 0) return;

    setPending(true);
    try {
      const res = await fetch('/api/operator/tiers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, minScore }),
      });
      if (!res.ok) {
        showFlash('err', 'Could not add tier.');
      } else {
        setNewName('');
        setNewMinScore('');
        await load();
        showFlash('ok', 'Tier added.');
      }
    } finally {
      setPending(false);
    }
  }, [newName, newMinScore, load]);

  const seed = useCallback(async () => {
    setSeedBusy(true);
    try {
      const res = await fetch('/api/operator/tiers/seed', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) showFlash('err', 'Could not seed defaults.');
      else {
        await load();
        showFlash('ok', 'Default tiers added.');
      }
    } finally {
      setSeedBusy(false);
    }
  }, [load]);

  if (!loaded) {
    return <p className="text-sm text-text-muted">Loading tiers…</p>;
  }

  return (
    <div className="space-y-6">
      {flash ? (
        <div
          className="rounded-md border px-3 py-2 text-sm"
          style={{
            borderColor: flash.kind === 'ok' ? 'var(--success)' : 'var(--danger)',
            color: flash.kind === 'ok' ? 'var(--success)' : 'var(--danger)',
            background:
              flash.kind === 'ok' ? 'var(--success-soft)' : 'var(--danger-soft)',
          }}
        >
          {flash.msg}
        </div>
      ) : null}

      {tiers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/50 p-8 text-center">
          <p className="text-sm font-medium text-text-primary">No tiers yet.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Add tiers one at a time below, or start with sensible defaults.
          </p>
          <button
            type="button"
            onClick={seed}
            disabled={seedBusy}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {seedBusy ? 'Seeding…' : 'Seed default tiers'}
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {tiers.map((t, i) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={pending || i === 0}
                  aria-label="Move up"
                  className="text-text-muted hover:text-text-primary disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={pending || i === tiers.length - 1}
                  aria-label="Move down"
                  className="text-text-muted hover:text-text-primary disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <input
                type="text"
                defaultValue={t.name}
                maxLength={40}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== t.name) void update(t.id, { name: v });
                }}
                className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-text-primary focus:border-border focus:outline-none"
              />

              <div className="flex items-center gap-1">
                <label className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  min score
                </label>
                <input
                  type="text"
                  defaultValue={t.minScore ?? ''}
                  placeholder="—"
                  size={5}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === '') {
                      if (t.minScore !== null) void update(t.id, { minScore: null });
                      return;
                    }
                    const n = Number(raw);
                    if (Number.isFinite(n) && n >= 0 && n <= 1 && n !== t.minScore) {
                      void update(t.id, { minScore: n });
                    }
                  }}
                  className="w-16 rounded border border-border bg-background px-2 py-1 text-right text-xs tabular-nums text-text-primary focus:border-primary focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Delete tier"
                className="text-text-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Add tier
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-text-secondary">Name</label>
            <input
              type="text"
              value={newName}
              maxLength={40}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Charter"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              style={{
                borderColor: errors.name ? 'var(--danger)' : undefined,
              }}
            />
            {errors.name ? (
              <p className="mt-1 text-xs text-danger">{errors.name}</p>
            ) : null}
          </div>
          <div>
            <label className="block text-xs text-text-secondary">
              Min score (0–1)
            </label>
            <input
              type="text"
              value={newMinScore}
              onChange={(e) => setNewMinScore(e.target.value)}
              placeholder="optional"
              className="mt-1 w-28 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              style={{
                borderColor: errors.minScore ? 'var(--danger)' : undefined,
              }}
            />
            {errors.minScore ? (
              <p className="mt-1 text-xs text-danger">{errors.minScore}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={add}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          Min score is the 0–1 aiScore floor for this tier. Leave blank for the
          baseline tier that everyone qualifies for.
        </p>
      </div>
    </div>
  );
}
