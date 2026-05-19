'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

type Faq = { question: string; answer: string };

export function MemberFaqEditor() {
  const [items, setItems] = useState<Faq[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/operator/settings/help-faq')
      .then((r) => r.json())
      .then((d: { faq: Faq[] }) => setItems(d.faq ?? []))
      .finally(() => setLoaded(true));
  }, []);

  function update(i: number, patch: Partial<Faq>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function add() {
    setItems((prev) => [...prev, { question: '', answer: '' }]);
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch('/api/operator/settings/help-faq', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ faq: items.filter((it) => it.question.trim() && it.answer.trim()) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setFlash({ kind: 'ok', msg: 'Saved.' });
    } catch (e: any) {
      setFlash({ kind: 'err', msg: e.message ?? 'Failed' });
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 3000);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">Member FAQ</h3>
        <p className="mt-0.5 text-xs text-text-secondary">
          Rendered at <code className="rounded bg-surface px-1">/m/help</code>. Empty = use defaults.
        </p>
      </div>
      <div className="space-y-4 p-4">
        {!loaded ? (
          <p className="text-xs text-text-secondary">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-text-secondary">
            No custom FAQ yet — members see the built-in defaults. Click Add to override.
          </p>
        ) : (
          items.map((it, i) => (
            <div key={i} className="rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-widest text-text-secondary">
                  #{i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-text-muted hover:text-danger"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={it.question}
                onChange={(e) => update(i, { question: e.target.value })}
                placeholder="Question"
                className="mb-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
              />
              <textarea
                value={it.answer}
                onChange={(e) => update(i, { answer: e.target.value })}
                placeholder="Answer"
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-text-primary focus:border-primary focus:outline-none"
              />
            </div>
          ))
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Add question
          </button>
          <div className="flex items-center gap-3">
            {flash ? (
              <span className="text-xs" style={{ color: flash.kind === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
                {flash.msg}
              </span>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={saving || !loaded}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save FAQ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
