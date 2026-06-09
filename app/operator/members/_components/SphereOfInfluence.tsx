'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';

// Influence Model — Layer 1 referral spine on the record (see INFLUENCE-MODEL.md).
// Shows the one referrer (lineage up) and the members this person referred (fan-out down),
// and lets a STAFF+ operator set/change/clear the referrer via a member picker. Internal
// operator-curation knowledge only; never sponsor-facing.

type Person = { id: string; fullName: string; email: string; status?: string };
type SphereData = { referrer: Person | null; referred: Person[]; referredCount: number };
type Candidate = { id: string; fullName: string; email: string };

export function SphereOfInfluence({
  memberId,
  canEdit,
}: {
  memberId: string;
  canEdit: boolean;
}) {
  const [data, setData] = useState<SphereData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/operator/members/${memberId}/referrer`, { credentials: 'include' });
      if (!res.ok) throw new Error('load');
      setData((await res.json()) as SphereData);
    } catch {
      setError('Could not load relationships.');
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Server-side member search for the referrer picker (reuses the roster endpoint).
  useEffect(() => {
    if (!picking) return;
    const q = query.trim();
    const seq = ++searchSeq.current;
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/operator/members?q=${encodeURIComponent(q)}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { members: Candidate[] };
        if (seq !== searchSeq.current) return; // ignore stale responses
        setResults(json.members.filter((m) => m.id !== memberId).slice(0, 8));
      } catch {
        /* picker search is best-effort */
      }
    }, 200);
    return () => window.clearTimeout(t);
  }, [query, picking, memberId]);

  const setReferrer = useCallback(
    async (referrerId: string | null) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/operator/members/${memberId}/referrer`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referrerId }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? 'Could not save.');
          return;
        }
        setPicking(false);
        setQuery('');
        setResults([]);
        await load();
      } catch {
        setError('Network error. Try again.');
      } finally {
        setSaving(false);
      }
    },
    [memberId, load],
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Sphere of influence
        </div>
        {data && data.referredCount > 0 ? (
          <span className="text-[10px] text-text-muted">
            referred {data.referredCount}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-text-muted">Loading…</p>
      ) : (
        <div className="mt-3 space-y-4">
          {/* Referred by — lineage up */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Referred by</div>
            {data?.referrer ? (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <Link
                  href={`/operator/members/${data.referrer.id}`}
                  className="truncate text-sm font-medium text-text-primary underline-offset-2 hover:underline"
                >
                  {data.referrer.fullName}
                </Link>
                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPicking((p) => !p)}
                      className="text-xs text-text-secondary hover:text-text-primary"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void setReferrer(null)}
                      className="text-xs text-text-muted hover:text-danger disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-sm text-text-muted">Not set</span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setPicking((p) => !p)}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    Set referrer
                  </button>
                ) : null}
              </div>
            )}

            {/* Referrer picker */}
            {canEdit && picking ? (
              <div className="mt-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
                    aria-hidden
                  />
                  <input
                    type="search"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search members…"
                    aria-label="Search for a referrer"
                    className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-8 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(false);
                      setQuery('');
                    }}
                    aria-label="Cancel"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {results.length > 0 ? (
                  <ul className="mt-1 max-h-56 overflow-auto rounded-md border border-border bg-surface">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void setReferrer(c.id)}
                          className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                        >
                          <span className="text-sm font-medium text-text-primary">{c.fullName}</span>
                          <span className="text-xs text-text-muted">{c.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : query.trim() ? (
                  <p className="mt-2 text-xs text-text-muted">No members match.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Referred — fan-out down */}
          <div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Referred</div>
            {data && data.referred.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {data.referred.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/operator/members/${r.id}`}
                      className="truncate text-sm text-text-primary underline-offset-2 hover:underline"
                    >
                      {r.fullName}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-text-muted">No referrals yet.</p>
            )}
          </div>

          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
