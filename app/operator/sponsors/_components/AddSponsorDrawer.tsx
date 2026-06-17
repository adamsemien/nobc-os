'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DetailDrawer } from '@/components/ui';

export type CreatedSponsor = {
  id: string;
  name: string;
  contactEmail: string | null;
  rightsFeeCents: number | null;
  createdAt: string;
};

const inputCls =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';
const labelCls = 'block text-xs font-medium text-text-secondary';

const EMPTY = {
  name: '',
  contactEmail: '',
  declaredObjectives: '',
  targetPersona: '',
  rightsFeeDollars: '',
  icp: '',
};

export function AddSponsorDrawer({ onCreated }: { onCreated: (s: CreatedSponsor) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    setError(null);
    setForm(EMPTY);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError('Name is required.');
      return;
    }

    // Rights fee is captured in dollars and stored as cents.
    let rightsFeeCents: number | undefined;
    const feeRaw = form.rightsFeeDollars.trim();
    if (feeRaw) {
      const dollars = Number(feeRaw);
      if (!Number.isFinite(dollars) || dollars < 0) {
        setError('Rights fee must be a positive number.');
        return;
      }
      rightsFeeCents = Math.round(dollars * 100);
    }

    const persona = form.targetPersona.trim();

    setSubmitting(true);
    try {
      const res = await fetch('/api/operator/sponsors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contactEmail: form.contactEmail.trim() || undefined,
          declaredObjectives: form.declaredObjectives.trim() || undefined,
          // Stored as structured Json; parsePersona tolerates this shape. The
          // structured archetype/industry editor lives in Recap Studio.
          targetPersonaCriteria: persona ? { notes: persona } : undefined,
          rightsFeeCents,
          icp: form.icp.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as CreatedSponsor & { error?: string };
      if (!res.ok || !payload.id) {
        setError(payload.error ?? 'Could not create sponsor.');
        return;
      }
      onCreated(payload);
      setOpen(false);
      setForm(EMPTY);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Sponsor
      </button>

      <DetailDrawer
        open={open}
        onClose={close}
        title="Add sponsor"
        ariaLabel="Add sponsor"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-sponsor-form"
              disabled={submitting}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add sponsor'}
            </button>
          </div>
        }
      >
        <form id="add-sponsor-form" onSubmit={submit} className="space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-1">
            <label htmlFor="sp-name" className={labelCls}>
              Name <span className="text-danger">*</span>
            </label>
            <input
              id="sp-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              autoComplete="off"
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="sp-email" className={labelCls}>
              Contact email
            </label>
            <input
              id="sp-email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
              placeholder="sponsor@brand.com"
              autoComplete="off"
              className={inputCls}
            />
            <p className="text-[11px] text-text-muted">Where recap links are sent.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="sp-objectives" className={labelCls}>
              Declared objectives
            </label>
            <textarea
              id="sp-objectives"
              value={form.declaredObjectives}
              onChange={(e) => set('declaredObjectives', e.target.value)}
              rows={3}
              placeholder="Awareness, affinity, acquisition, activation…"
              className={inputCls}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="sp-persona" className={labelCls}>
              Target persona criteria
            </label>
            <textarea
              id="sp-persona"
              value={form.targetPersona}
              onChange={(e) => set('targetPersona', e.target.value)}
              rows={3}
              placeholder="Who they want in the room"
              className={inputCls}
            />
            <p className="text-[11px] text-text-muted">
              Free text. Structured persona matching is edited in Recap Studio.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="sp-fee" className={labelCls}>
              Rights fee (USD)
            </label>
            <input
              id="sp-fee"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.rightsFeeDollars}
              onChange={(e) => set('rightsFeeDollars', e.target.value)}
              placeholder="0.00"
              autoComplete="off"
              className={inputCls}
            />
            <p className="text-[11px] text-text-muted">Dollars. Stored as cents.</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="sp-icp" className={labelCls}>
              ICP description
            </label>
            <textarea
              id="sp-icp"
              value={form.icp}
              onChange={(e) => set('icp', e.target.value)}
              rows={2}
              placeholder="Ideal customer profile"
              className={inputCls}
            />
          </div>
        </form>
      </DetailDrawer>
    </>
  );
}
