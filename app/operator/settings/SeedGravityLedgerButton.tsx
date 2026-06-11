'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Settings → Developer: one-click demo seed for the Gravity Ledger. Posts the
 * dev-gated seed route, then links straight to the Connectors ledger. No hotkey,
 * no toolbar — a plain always-visible card (the DevToolbar shortcut doesn't fire).
 */
export function SeedGravityLedgerButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [detail, setDetail] = useState('');

  async function seed() {
    setState('busy');
    setDetail('');
    try {
      const res = await fetch('/api/dev/seed-gravity-ledger', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setDetail(data.detail ?? data.error ?? 'Failed');
        return;
      }
      setState('done');
    } catch {
      setState('error');
      setDetail('Network error');
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: 'var(--primary-soft, var(--muted))', color: 'var(--primary)' }}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <h3 className="text-base font-semibold text-text-primary">Seed Gravity Ledger demo</h3>
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">
        Resets the demo tenant and wires connectors + captured revenue so the Connectors ledger shows real
        data. Local dev only; takes ~20–40s.
      </p>
      <button
        type="button"
        onClick={seed}
        disabled={state === 'busy'}
        className="self-start rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {state === 'busy' ? 'Seeding…' : state === 'done' ? 'Re-seed' : 'Seed now'}
      </button>
      {state === 'done' && (
        <Link
          href="/operator/members/connectors"
          className="text-sm font-medium text-primary hover:underline"
        >
          Seeded ✓ — open the Connectors ledger →
        </Link>
      )}
      {state === 'error' && <p className="text-sm text-text-secondary">Couldn’t seed. {detail}</p>}
    </div>
  );
}
