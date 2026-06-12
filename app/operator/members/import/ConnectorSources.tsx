'use client';

import { useState } from 'react';

/** Pull contacts from a connected source (Producer vendors, beehiiv subscribers) into
 *  the spine. Each button hits its ingest route, which runs the same resolve → persist
 *  pipeline as the CSV import. Before the DB window the routes return a clean message
 *  (not configured / schema not applied) which is shown inline. */

type SourceResult = {
  ok: true;
  fetched?: number;
  created: number;
  attached: number;
  deferred: number;
};

type Source = {
  key: 'producer' | 'beehiiv' | 'activecampaign';
  label: string;
  blurb: string;
  endpoint: string;
};

const SOURCES: Source[] = [
  {
    key: 'producer',
    label: 'Producer vendors',
    blurb: 'Vendors, sponsors and partners from your Producer directory.',
    endpoint: '/api/operator/crm/import/producer',
  },
  {
    key: 'beehiiv',
    label: 'beehiiv subscribers',
    blurb: 'Your newsletter audience — matched to members by email, phone or Instagram.',
    endpoint: '/api/operator/crm/import/beehiiv',
  },
  {
    key: 'activecampaign',
    label: 'ActiveCampaign contacts',
    blurb: 'Email contacts — matched to members by email or phone.',
    endpoint: '/api/operator/crm/import/activecampaign',
  },
];

export function ConnectorSources() {
  return (
    <div className="mt-10">
      <h2 className="text-sm font-medium text-text-primary">Or pull from a connected source</h2>
      <p className="mt-1 text-xs text-text-muted">
        Imports run against your members — matches link, new contacts are created, ambiguous
        ones are held for review.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {SOURCES.map((s) => (
          <SourceCard key={s.key} source={s} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SourceResult | null>(null);

  async function pull() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(source.endpoint, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Import failed.');
        return;
      }
      setResult(data as SourceResult);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-4">
      <div className="font-medium text-text-primary">{source.label}</div>
      <p className="mt-1 flex-1 text-xs text-text-secondary">{source.blurb}</p>

      <div className="mt-3">
        {result ? (
          <p className="text-sm text-text-primary">
            ✓ {result.created} created, {result.attached} linked
            {result.deferred > 0 && `, ${result.deferred} for review`}
            {typeof result.fetched === 'number' && (
              <span className="text-text-muted"> · {result.fetched} pulled</span>
            )}
          </p>
        ) : (
          <button
            type="button"
            onClick={pull}
            disabled={loading}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-background disabled:opacity-50"
          >
            {loading ? 'Pulling…' : 'Pull & import'}
          </button>
        )}
        {error && (
          <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-text-primary">{error}</p>
        )}
      </div>
    </div>
  );
}
