'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, GitMerge } from 'lucide-react';
import { EmptyState, StatusBadge } from '@/components/ui';

export type PersonView = {
  id: string;
  label: string;
  placeholder: boolean;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  accountLinked: boolean;
  sources: string[];
  membership: string | null;
  activityCount: number;
  applicationCount: number;
  added: string;
};

export type PairView = {
  matchType: 'flagged' | 'email' | 'phone';
  a: PersonView;
  b: PersonView;
  defaultSurvivorId: string;
  blocked: 'both_have_members' | 'two_linked_accounts' | null;
};

const MATCH_LABELS: Record<PairView['matchType'], string> = {
  flagged: 'Flagged at intake',
  email: 'Same email',
  phone: 'Same phone',
};

const BLOCKED_MESSAGES: Record<NonNullable<PairView['blocked']>, string> = {
  both_have_members:
    'Both records have a membership profile. Membership-level duplicates are resolved with the Member merge tool — this pair cannot be merged here.',
  two_linked_accounts:
    'Each record is linked to a different signed-up account. Two accounts means two people — these records cannot be merged.',
};

function pairId(p: PairView): string {
  return [p.a.id, p.b.id].sort().join('::');
}

export function MergeQueueView({ pairs, canMerge }: { pairs: PairView[]; canMerge: boolean }) {
  const router = useRouter();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [survivors, setSurvivors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const visible = pairs.filter((p) => !skipped.has(pairId(p)));

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={GitMerge}
        title="Queue is clear"
        subtitle="Flagged duplicates and matching email/phone pairs will appear here for review."
      />
    );
  }

  async function post(url: string, body: unknown, key: string) {
    setBusy(key);
    setErrors((e) => ({ ...e, [key]: '' }));
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrors((e) => ({ ...e, [key]: data?.error ?? 'Action failed.' }));
        return;
      }
      router.refresh();
    } catch {
      setErrors((e) => ({ ...e, [key]: 'Action failed.' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {visible.map((pair) => {
        const key = pairId(pair);
        const survivorId = survivors[key] ?? pair.defaultSurvivorId;
        const loser = survivorId === pair.a.id ? pair.b : pair.a;
        return (
          <section key={key} className="rounded-md border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <StatusBadge tone="warning">{MATCH_LABELS[pair.matchType]}</StatusBadge>
              <span className="text-[12px]" style={{ color: 'var(--text-tertiary, var(--text-muted))' }}>
                Pick the record to keep — the other folds into it.
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[pair.a, pair.b].map((p) => {
                const chosen = p.id === survivorId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={Boolean(pair.blocked)}
                    onClick={() => setSurvivors((s) => ({ ...s, [key]: p.id }))}
                    className="rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed"
                    style={{
                      borderColor: chosen && !pair.blocked ? 'var(--primary)' : 'var(--border)',
                      background: chosen && !pair.blocked
                        ? 'color-mix(in srgb, var(--primary) 5%, transparent)'
                        : 'transparent',
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Link
                        href={`/operator/people/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`truncate text-[13px] font-medium text-text-primary hover:underline ${p.placeholder ? 'font-normal italic' : ''}`}
                        style={p.placeholder ? { color: 'var(--text-tertiary, var(--text-muted))' } : undefined}
                      >
                        {p.label}
                      </Link>
                      {chosen && !pair.blocked ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                          style={{ color: 'var(--primary)' }}
                        >
                          <Check className="h-3.5 w-3.5" /> Keep
                        </span>
                      ) : null}
                    </div>
                    <dl className="space-y-1 text-[12px]">
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Email</dt>
                        <dd className="text-right text-text-primary">
                          {p.email ?? '—'}
                          {p.email ? (
                            <span
                              className="ml-1.5 text-[11px]"
                              style={{ color: 'var(--text-tertiary, var(--text-muted))' }}
                            >
                              {p.emailVerified ? 'Verified' : 'Unverified'}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Phone</dt>
                        <dd className="text-text-primary">{p.phone ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Account</dt>
                        <dd className="text-text-primary">{p.accountLinked ? 'Linked' : 'None'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Sources</dt>
                        <dd className="text-right text-text-primary">
                          {p.sources.length ? p.sources.join(', ') : '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Membership</dt>
                        <dd className="text-text-primary">{p.membership ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Activity</dt>
                        <dd className="text-text-primary">
                          {p.activityCount} {p.activityCount === 1 ? 'event' : 'events'}
                          {p.applicationCount > 0
                            ? ` · ${p.applicationCount} ${p.applicationCount === 1 ? 'application' : 'applications'}`
                            : ''}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-text-secondary">Added</dt>
                        <dd className="text-text-primary">{p.added}</dd>
                      </div>
                    </dl>
                  </button>
                );
              })}
            </div>

            {pair.blocked ? (
              <p
                className="mt-3 rounded-md border px-3 py-2 text-[12px]"
                style={{
                  background: 'var(--warning-soft)',
                  borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)',
                  color: 'var(--text-primary)',
                }}
              >
                {BLOCKED_MESSAGES[pair.blocked]}
              </p>
            ) : null}
            {errors[key] ? (
              <p className="mt-3 text-[12px]" style={{ color: 'var(--danger)' }}>
                {errors[key]}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(pair.blocked) || !canMerge || busy === key}
                title={
                  pair.blocked
                    ? undefined
                    : canMerge
                      ? undefined
                      : 'Executing a merge requires an Admin'
                }
                onClick={() =>
                  post(
                    '/api/operator/people/merge',
                    { survivorId, loserId: loser.id },
                    key,
                  )
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--primary)' }}
              >
                <GitMerge className="h-4 w-4" />
                {busy === key ? 'Merging…' : 'Merge into survivor'}
              </button>
              <button
                type="button"
                disabled={busy === key}
                onClick={() =>
                  post(
                    '/api/operator/people/dismiss-duplicate',
                    { personAId: pair.a.id, personBId: pair.b.id, matchType: pair.matchType },
                    key,
                  )
                }
                className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                Not a duplicate
              </button>
              <button
                type="button"
                disabled={busy === key}
                onClick={() => setSkipped((s) => new Set(s).add(key))}
                className="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
