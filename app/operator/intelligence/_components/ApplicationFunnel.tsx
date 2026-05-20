'use client';

import { useState } from 'react';
import Link from 'next/link';

export interface FunnelSnapshot {
  submitted: number;
  pending: number;
  approved: number;
  rejected: number;
  waitlisted: number;
  hold: number;
  stale: number;
  avgScore: number | null;
  scoredCount: number;
  aboveThreshold: number;
  belowThreshold: number;
  staleSample: Array<{
    id: string;
    fullName: string;
    aiScore: number | null;
    createdAt: string;
  }>;
}

const HEADING_FONT = 'var(--font-pp-editorial, Georgia, serif)';

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export function ApplicationFunnel({ snapshot }: { snapshot: FunnelSnapshot }) {
  const [mode, setMode] = useState<'funnel' | 'cards'>('cards');
  const f = snapshot;

  if (f.submitted === 0) {
    return (
      <div
        className="mb-6 rounded-[10px] border px-5 py-6 text-center text-[13px]"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)' }}
      >
        <p
          className="mb-2 text-[15px]"
          style={{ fontFamily: HEADING_FONT, color: 'var(--text-primary)' }}
        >
          No signals yet
        </p>
        Applications will surface insights here as they come in.
      </div>
    );
  }

  const widthPct = (n: number) => (f.submitted === 0 ? 0 : Math.round((n / f.submitted) * 100));

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2
            className="text-[18px] italic leading-tight"
            style={{ fontFamily: HEADING_FONT, fontWeight: 200, color: 'var(--text-primary)' }}
          >
            Application funnel
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Real counts from the queue — refreshed on each load.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setMode('cards')}
            className="px-3 py-1 text-[11px]"
            style={{
              color: mode === 'cards' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: mode === 'cards' ? 'var(--surface)' : 'transparent',
            }}
          >
            Cards
          </button>
          <button
            onClick={() => setMode('funnel')}
            className="px-3 py-1 text-[11px]"
            style={{
              color: mode === 'funnel' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: mode === 'funnel' ? 'var(--surface)' : 'transparent',
            }}
          >
            Funnel
          </button>
        </div>
      </div>

      {mode === 'cards' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <FunnelStat label="Submitted" value={f.submitted} tone="default" />
          <FunnelStat label="Pending" value={f.pending} tone="warning" />
          <FunnelStat label="Approved" value={f.approved} tone="success" />
          <FunnelStat label="Rejected" value={f.rejected} tone="danger" />
          <FunnelStat label="Waitlisted" value={f.waitlisted} tone="default" />
          <FunnelStat label="On hold" value={f.hold} tone="warning" />
        </div>
      ) : (
        <div className="space-y-1.5">
          <FunnelBar label="Submitted" value={f.submitted} pct={100} accent="var(--text-primary)" />
          <FunnelBar label="Pending" value={f.pending} pct={widthPct(f.pending)} accent="var(--warning)" />
          <FunnelBar label="Approved" value={f.approved} pct={widthPct(f.approved)} accent="var(--success)" />
          <FunnelBar label="Waitlisted" value={f.waitlisted} pct={widthPct(f.waitlisted)} accent="var(--text-secondary)" />
          <FunnelBar label="Rejected" value={f.rejected} pct={widthPct(f.rejected)} accent="var(--danger)" />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          className="rounded-md p-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p
            className="text-[10px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Avg pending score
          </p>
          <p
            className="mt-1 text-xl font-semibold tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          >
            {typeof f.avgScore === 'number' ? (f.avgScore * 10).toFixed(1) : '—'}
            {typeof f.avgScore === 'number' && (
              <span className="ml-1 text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
                / 10
              </span>
            )}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {f.scoredCount} scored
          </p>
        </div>
        <div
          className="rounded-md p-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p
            className="text-[10px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Above 0.7 threshold
          </p>
          <p
            className="mt-1 text-xl font-semibold tabular-nums"
            style={{ color: 'var(--success)' }}
          >
            {f.aboveThreshold}
            <span className="ml-1 text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
              / {f.pending} pending
            </span>
          </p>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {f.belowThreshold} below
          </p>
        </div>
        <div
          className="rounded-md p-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p
            className="text-[10px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Stale &gt; 7 days
          </p>
          <p
            className="mt-1 text-xl font-semibold tabular-nums"
            style={{ color: f.stale > 0 ? 'var(--warning)' : 'var(--text-primary)' }}
          >
            {f.stale}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            in the queue
          </p>
        </div>
      </div>

      {f.staleSample.length > 0 && (
        <div
          className="mt-3 rounded-md p-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p
            className="mb-2 text-[10px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Oldest stale applications
          </p>
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {f.staleSample.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-1.5 text-[12px]">
                <Link
                  href={`/operator/applications/${s.id}`}
                  className="hover:underline"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {s.fullName}
                </Link>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {daysAgo(s.createdAt)}d ago · {fmtDateShort(s.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FunnelStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'warning' | 'success' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'danger'
      ? 'var(--danger)'
      : tone === 'warning'
      ? 'var(--warning)'
      : 'var(--text-primary)';
  return (
    <div
      className="rounded-md p-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  pct,
  accent,
}: {
  label: string;
  value: number;
  pct: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="w-24 text-[11px] uppercase tracking-[0.12em]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </span>
      <div
        className="relative h-6 flex-1 overflow-hidden rounded-md"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div
          className="h-full"
          style={{
            width: `${Math.max(pct, value > 0 ? 4 : 0)}%`,
            background: accent,
            opacity: 0.85,
          }}
        />
        <span
          className="absolute inset-y-0 left-2 flex items-center text-[11px] font-medium tabular-nums"
          style={{ color: 'var(--text-primary)' }}
        >
          {value}
          <span className="ml-1.5 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {pct}%
          </span>
        </span>
      </div>
    </div>
  );
}
