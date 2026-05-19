'use client';

import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';

export type EditorQuestion = {
  id?: string;
  stableKey?: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'url' | 'checkbox';
  required: boolean;
  placeholder?: string | null;
};

const TYPE_OPTIONS: { value: EditorQuestion['type']; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Single choice' },
  { value: 'url', label: 'URL' },
  { value: 'checkbox', label: 'Checkbox' },
];

function makeBlank(): EditorQuestion {
  return { label: '', type: 'text', required: false, placeholder: '' };
}

export function ApplicationFormEditor({ initial }: { initial: EditorQuestion[] }) {
  const [items, setItems] = useState<EditorQuestion[]>(initial.length ? initial : []);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<EditorQuestion>) {
    setItems((arr) => arr.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function remove(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    setItems((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const copy = arr.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function add() {
    setItems((arr) => [...arr, makeBlank()]);
  }

  async function save() {
    if (items.some((q) => !q.label.trim())) {
      setError('Every question needs a label.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/operator/settings/application', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: items.map((q) => ({
            id: q.id,
            label: q.label.trim(),
            type: q.type,
            required: q.required,
            placeholder: q.placeholder ?? '',
          })),
        }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof error === 'string' ? error : 'Could not save');
      }
      setSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {items.map((q, i) => (
          <li
            key={q.id ?? `new-${i}`}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded p-0.5 text-text-muted hover:bg-muted hover:text-text-primary disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <span className="text-center text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  className="rounded p-0.5 text-text-muted hover:bg-muted hover:text-text-primary disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-text-secondary mb-1.5">
                    Label
                  </label>
                  <input
                    type="text"
                    value={q.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="What are you currently building?"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-text-secondary mb-1.5">
                      Type
                    </label>
                    <select
                      value={q.type}
                      onChange={(e) => update(i, { type: e.target.value as EditorQuestion['type'] })}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                    >
                      {TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-text-secondary mb-1.5">
                      Placeholder
                    </label>
                    <input
                      type="text"
                      value={q.placeholder ?? ''}
                      onChange={(e) => update(i, { placeholder: e.target.value })}
                      placeholder="Optional helper text"
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  Required
                </label>
              </div>

              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                aria-label="Remove question"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={add}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-text-secondary transition-colors hover:border-solid hover:border-text-tertiary hover:text-text-primary"
      >
        <Plus className="h-4 w-4" />
        Add question
      </button>

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-xs text-text-muted">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : savedAt ? (
            `Saved ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          ) : (
            'Changes save when you press Save.'
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
