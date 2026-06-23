'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import {
  type AIModelChoice,
  type AIModelId,
  costGlyphs,
  speedLabel,
} from '@/lib/ai-models';

export function ModelSwitcher({
  models,
  currentId,
}: {
  models: AIModelChoice[];
  currentId: AIModelId;
}) {
  const [selected, setSelected] = useState<AIModelId>(currentId);
  const [saved, setSaved] = useState<AIModelId>(currentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(id: AIModelId) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/operator/settings/model', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id }),
      });
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? 'Could not save');
      }
      setSaved(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save';
      setError(msg);
      setSelected(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {models.map((m) => {
        const isSelected = selected === m.id;
        const isSaved = saved === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              if (saving) return;
              setSelected(m.id);
              void save(m.id);
            }}
            disabled={saving}
            className={
              'flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors ' +
              (isSelected
                ? 'border-primary bg-card'
                : 'border-border bg-card hover:border-primary/40')
            }
          >
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
              style={{
                borderColor: isSelected ? 'var(--primary)' : 'var(--border)',
                background: isSelected ? 'var(--primary)' : 'transparent',
                color: 'var(--primary-foreground)',
              }}
            >
              {isSelected ? <Check className="h-3 w-3" aria-hidden /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-text-primary">
                    {m.label}
                    {isSaved ? (
                      <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-success">
                        active
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-text-muted">{m.id}</div>
                </div>
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-text-secondary">
                  <span>{speedLabel(m.speed)}</span>
                  <span className="opacity-60">·</span>
                  <span title={`${m.costTier} cost`}>{costGlyphs(m.costTier)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{m.description}</p>
            </div>
          </button>
        );
      })}

      {error ? (
        <p className="rounded border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-text-muted">
        Runtime models follow a two-tier policy (lib/ai/runtime-models.ts): the JUDGMENT_MODEL
        tier (Sonnet 4.6) for scoring and member-facing tasks, and the MECHANICAL_MODEL tier
        (Haiku 4.5) for mechanical work.
      </p>
    </div>
  );
}
