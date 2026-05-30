'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

/** Small "Generate with AI" button that drafts a description from event/series
 *  facts (via POST /api/operator/events/generate-description) and hands the
 *  result back through onResult. Manages its own loading + error state. The
 *  result replaces the current description (no confirm). */
type GenerateContext = {
  title: string;
  location?: string | null;
  startAt?: string | null;
  currentDescription?: string | null;
  kind: 'event' | 'series';
};

export function GenerateDescriptionButton({
  context,
  onResult,
}: {
  context: GenerateContext;
  onResult: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTitle = context.title.trim().length > 0;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/operator/events/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(context),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === 'string' ? body.error : `Failed (${res.status})`);
      }
      const { description } = (await res.json()) as { description: string };
      onResult(description);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={generate}
        disabled={busy || !hasTitle}
        title={hasTitle ? 'Generate a description with AI' : 'Add a name first'}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? 'Generating…' : 'Generate with AI'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
