'use client';

import { useState } from 'react';
import { Database, Mail, Building2, type LucideIcon } from 'lucide-react';

/**
 * One-click connector sync. Each card POSTs to its STAFF-gated import route, which pulls
 * from the source and writes Member + ContactSource rows through the shared, suppression-
 * guarded persist pipeline. A two-step confirm names the target instance (the EnvBadge in
 * the header shows prod vs sandbox) so a prod import is never one stray click away.
 *
 * The routes are env-gated: an unconfigured connector returns 400 with a message; before
 * the Contact-spine DB window they return 503. Both surface inline, untouched.
 */
type SourceKey = 'activecampaign' | 'beehiiv' | 'producer';

type Source = { key: SourceKey; name: string; blurb: string; path: string; Icon: LucideIcon };

const SOURCES: Source[] = [
  {
    key: 'activecampaign',
    name: 'ActiveCampaign',
    blurb: 'Pulls contacts from the Network, Industry Partner, and Sphere lists only. The realtor book and the full database are firewalled off.',
    path: '/api/operator/crm/import/activecampaign',
    Icon: Mail,
  },
  {
    key: 'beehiiv',
    name: 'Beehiiv',
    blurb: 'Pulls newsletter subscribers (subscriber role).',
    path: '/api/operator/crm/import/beehiiv',
    Icon: Database,
  },
  {
    key: 'producer',
    name: 'Producer',
    blurb: 'Pulls the Producer vendor directory (vendor role).',
    path: '/api/operator/crm/import/producer',
    Icon: Building2,
  },
];

type ImportResult = {
  ok?: boolean;
  created?: number;
  attached?: number;
  deferred?: number;
  fetched?: number;
  lists?: string[];
  error?: string;
};

type CardState =
  | { phase: 'idle' }
  | { phase: 'confirm' }
  | { phase: 'busy' }
  | { phase: 'done'; result: ImportResult }
  | { phase: 'error'; message: string };

export function ConnectorImports({ envLabel }: { envLabel: string }) {
  return (
    <section className="mt-12">
      <h2 className="font-medium text-text-primary">Connector sync</h2>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">
        Pull contacts straight from a connected source into your members. Unlike the CSV preview above,
        this <strong>writes</strong> to the current workspace ({envLabel}). Blocked contacts (RedList /
        WatchList) are imported flagged, never as clean sendable members.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCES.map((s) => (
          <ConnectorCard key={s.key} source={s} envLabel={envLabel} />
        ))}
      </div>
    </section>
  );
}

function ConnectorCard({ source, envLabel }: { source: Source; envLabel: string }) {
  const [state, setState] = useState<CardState>({ phase: 'idle' });
  const { Icon } = source;

  async function run() {
    setState({ phase: 'busy' });
    try {
      const res = await fetch(source.path, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as ImportResult;
      if (!res.ok) {
        setState({ phase: 'error', message: body.error ?? `Import failed (${res.status}).` });
        return;
      }
      setState({ phase: 'done', result: body });
    } catch {
      setState({ phase: 'error', message: 'Network error — try again.' });
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-muted" aria-hidden />
        <span className="font-medium text-text-primary">{source.name}</span>
      </div>
      <p className="mt-1.5 flex-1 text-[13px] leading-snug text-text-secondary">{source.blurb}</p>

      <div className="mt-3">
        {state.phase === 'idle' && (
          <button
            type="button"
            onClick={() => setState({ phase: 'confirm' })}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Run import
          </button>
        )}

        {state.phase === 'confirm' && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-text-secondary">
              Import to <strong>{envLabel}</strong>?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={run}
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Confirm import
              </button>
              <button
                type="button"
                onClick={() => setState({ phase: 'idle' })}
                className="text-sm text-text-muted underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {state.phase === 'busy' && <span className="text-sm text-text-muted">Importing…</span>}

        {state.phase === 'done' && (
          <div className="text-[13px] text-text-secondary">
            <div className="font-medium text-text-primary">
              Created {state.result.created ?? 0} · Attached {state.result.attached ?? 0} · Deferred{' '}
              {state.result.deferred ?? 0}
            </div>
            {state.result.lists && state.result.lists.length > 0 && (
              <div className="mt-0.5 text-text-muted">Lists: {state.result.lists.join(', ')}</div>
            )}
            <button
              type="button"
              onClick={() => setState({ phase: 'idle' })}
              className="mt-2 text-sm text-text-muted underline"
            >
              Run again
            </button>
          </div>
        )}

        {state.phase === 'error' && (
          <div className="text-[13px]" style={{ color: 'var(--danger)' }}>
            <div>{state.message}</div>
            <button
              type="button"
              onClick={() => setState({ phase: 'idle' })}
              className="mt-1 text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
