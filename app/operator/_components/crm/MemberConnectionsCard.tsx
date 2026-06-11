'use client';

/** MemberConnectionsCard — "Sphere of Influence" people card (tranche S).
 *
 *  Consumes GET /api/operator/members/[id]/connections.
 *  Contract: MemberConnections { memberId, connections: Array<{ memberId, firstName, lastName, relationLabel }> }
 *
 *  Renders connection edge-chips in a card shell. Empty state is warm copy
 *  per Form §11. Loading uses <Skeleton>.
 *
 *  NOTE: A `data-tenur-slot` attribute is left on the card footer for future
 *  Tenur relationship-context enrichment. Do NOT build Tenur anything here.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Skeleton } from './Skeleton';

type Connection = {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  relationLabel: string;
};

type MemberConnections = {
  memberId: string;
  connections: Connection[];
};

type Props = { memberId: string };

function displayName(c: Connection): string {
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Member';
}

export function MemberConnectionsCard({ memberId }: Props) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [data, setData] = useState<MemberConnections | null>(null);

  useEffect(() => {
    if (!memberId) return;

    setState('loading');
    fetch(`/api/operator/members/${memberId}/connections`)
      .then(async (res) => {
        if (!res.ok) throw new Error('connections_fetch_failed');
        return res.json() as Promise<MemberConnections>;
      })
      .then((d) => {
        setData(d);
        setState('ok');
      })
      .catch((err) => {
        console.error('[MemberConnectionsCard] fetch failed', err);
        setState('error');
      });
  }, [memberId]);

  return (
    <div
      className="rounded-[var(--radius-base)] border"
      style={{
        background: 'var(--crm-panel-bg)',
        borderColor: 'var(--crm-panel-border)',
      }}
    >
      {/* Card header */}
      <div
        className="px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid var(--crm-panel-border)' }}
      >
        <p
          className="text-[0.65rem] font-medium uppercase tracking-widest"
          style={{ color: 'var(--crm-panel-label)' }}
        >
          Sphere of Influence
        </p>
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        {state === 'loading' && (
          <div className="space-y-2" aria-label="Loading connections">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-4/5" />
            <Skeleton className="h-6 w-3/5" />
          </div>
        )}

        {state === 'error' && (
          <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
            Couldn&rsquo;t load connections right now &mdash; try refreshing.
          </p>
        )}

        {state === 'ok' && data && data.connections.length === 0 && (
          /* Empty state — Form §11 */
          <div className="flex flex-col gap-1">
            <p className="text-[13px]" style={{ color: 'var(--crm-panel-value)' }}>
              No connections on record yet.
            </p>
            <p className="text-[12px]" style={{ color: 'var(--crm-panel-label)' }}>
              Referrals and co-attendees will surface here over time.
            </p>
          </div>
        )}

        {state === 'ok' && data && data.connections.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.connections.map((c) => (
              <Link
                key={c.memberId}
                href={`/operator/members/${c.memberId}`}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors hover:border-primary"
                style={{
                  background: 'var(--crm-edge-chip-bg)',
                  color: 'var(--crm-edge-chip-fg)',
                  borderColor: 'var(--crm-panel-border)',
                }}
              >
                <span style={{ color: 'var(--crm-panel-value)' }}>
                  {displayName(c)}
                </span>
                <span
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: 'var(--crm-panel-label)' }}
                >
                  {c.relationLabel}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Tenur seam — leave empty; enrichment surfaces here in a future slice */}
      <div data-tenur-slot="connection-enrichment" />
    </div>
  );
}
