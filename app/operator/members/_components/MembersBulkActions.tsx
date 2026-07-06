'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { archetypeDisplayName } from '@/config/archetypes';
import {
  Avatar,
  DataTableShell,
  DataTableHead,
  DataTableHeader,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/ui';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { ScoreBadge } from '../../_components/ScoreBadge';
import { logQAAction } from '@/lib/dev/qa-action-log';
import { InlineEditCell } from './InlineEditCell';

export type MembersBulkMember = {
  id: string;
  fullName: string;
  email: string;
  companyName: string | null;
  archetype: string | null;
  aiScore: number | null;
  totalEventsAttended: number;
  lastAttendedDate: string | null;
  createdAt: string;
  isVip: boolean;
  isBlocked: boolean;
};

type Action = 'purple' | 'unpurple' | 'block' | 'unblock' | 'tag';

const ACTION_LABEL: Record<Action, string> = {
  purple: 'Add to Purple list',
  unpurple: 'Remove from Purple list',
  block: 'Block',
  unblock: 'Unblock',
  tag: 'Tag',
};

// Roster facets — the no-schema "filterable roster" foundation (Curate). Pure client-side
// filtering over the already-loaded rows; no archetype/psychographic facet (firewall + scope).
type Facet = 'all' | 'vip' | 'blocked' | 'attended';

const FACETS: { key: Facet; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'vip', label: 'Purple list' },
  { key: 'attended', label: 'Attended' },
  { key: 'blocked', label: 'Blocked' },
];

function matchesFacet(m: MembersBulkMember, facet: Facet): boolean {
  switch (facet) {
    case 'vip':
      return m.isVip;
    case 'blocked':
      return m.isBlocked;
    case 'attended':
      return m.totalEventsAttended > 0;
    default:
      return true;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Sortable roster columns (the "filterable roster" foundation, no schema).
type SortKey = 'name' | 'score' | 'events' | 'lastSeen' | 'joined';

function timeVal(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

function compareBy(a: MembersBulkMember, b: MembersBulkMember, key: SortKey): number {
  switch (key) {
    case 'name':
      return a.fullName.localeCompare(b.fullName);
    case 'score':
      return (a.aiScore ?? -1) - (b.aiScore ?? -1);
    case 'events':
      return a.totalEventsAttended - b.totalEventsAttended;
    case 'lastSeen':
      return timeVal(a.lastAttendedDate) - timeVal(b.lastAttendedDate);
    case 'joined':
      return timeVal(a.createdAt) - timeVal(b.createdAt);
    default:
      return 0;
  }
}

type SortState = { key: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void };

function SortButton({
  k,
  sort,
  reverse,
  children,
}: {
  k: SortKey;
  sort: SortState;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => sort.onSort(k)}
      className={`inline-flex items-center gap-1 ${reverse ? 'flex-row-reverse' : ''} ${
        active ? 'text-text-primary' : 'hover:text-text-primary'
      }`}
    >
      <span>{children}</span>
      <span className="text-[8px] leading-none text-text-muted" aria-hidden>
        {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
      </span>
    </button>
  );
}

export function MembersBulkActions({
  members,
  canEdit = false,
  canBulk = false,
}: {
  members: MembersBulkMember[];
  canEdit?: boolean;
  // member.bulk (OWNER/ADMIN). Defense-in-depth: hides selection + the bulk bar for
  // roles the server would 403 (STAFF/Viewer). The /api/operator/members/bulk route
  // is the real gate.
  canBulk?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [tagValue, setTagValue] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [facet, setFacet] = useState<Facet>('all');

  const [sortKey, setSortKey] = useState<SortKey>('joined');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = members.filter((m) => {
      if (!matchesFacet(m, facet)) return false;
      if (!q) return true;
      return m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => dir * compareBy(a, b, sortKey));
  }, [members, query, facet, sortKey, sortDir]);

  const onSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      // Sensible default direction per column: names A→Z, everything else high→low.
      setSortDir(key === 'name' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const run = useCallback(
    async (action: Action) => {
      setPending(action);
      const ids = Array.from(selected);
      try {
        const res = await fetch('/api/operator/members/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids,
            action,
            tag: action === 'tag' ? tagValue.trim() : undefined,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          succeeded?: number;
          failed?: number;
          error?: string;
        };
        if (!res.ok || !payload.ok) {
          setFlash(payload.error ?? 'Bulk action failed.');
        } else {
          const succeeded = payload.succeeded ?? ids.length;
          setFlash(`${ACTION_LABEL[action]} applied to ${succeeded} member${succeeded === 1 ? '' : 's'}.`);
          setSelected(new Set());
          logQAAction(`bulk ${action} ${succeeded} member(s)`);
        }
      } catch {
        setFlash('Network error. Try again.');
      } finally {
        setPending(null);
        setConfirm(null);
        window.setTimeout(() => setFlash(null), 4000);
      }
    },
    [selected, tagValue],
  );

  const count = selected.size;
  const allCount = members.length;
  const sort: SortState = { key: sortKey, dir: sortDir, onSort };

  return (
    <div className="relative">
      {flash ? (
        <div
          role="status"
          className="mb-3 rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-primary"
        >
          {flash}
        </div>
      ) : null}

      {canBulk && count > 0 ? (
        <div className="sticky top-2 z-20 mb-3 flex items-center gap-3 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm shadow-sm">
          <span className="text-text-secondary">
            {count} of {allCount} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!!pending}
              onClick={() => run('purple')}
              className="rounded px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              style={{ color: 'var(--accent, var(--primary))' }}
            >
              ✦ Add to Purple list
            </button>
            <button
              type="button"
              disabled={!!pending}
              onClick={() => setConfirm('block')}
              className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-muted disabled:opacity-50"
            >
              Block
            </button>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder="tag…"
                className="h-7 w-24 rounded border border-border bg-surface px-2 text-xs focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                disabled={!!pending || !tagValue.trim()}
                onClick={() => run('tag')}
                className="rounded px-2 py-1 text-xs font-medium text-text-secondary hover:bg-muted disabled:opacity-50"
              >
                Tag
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Filterable roster (Curate foundation) — search + lifecycle facets over loaded rows. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            aria-label="Search members"
            className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter members">
          {FACETS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFacet(f.key)}
              aria-pressed={facet === f.key}
              className={
                facet === f.key
                  ? 'rounded-full border border-primary bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary'
                  : 'rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-muted'
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-muted">
          {visible.length === members.length
            ? `${members.length} member${members.length === 1 ? '' : 's'}`
            : `${visible.length} of ${members.length}`}
        </span>
      </div>

      <DataTableShell>
        <DataTableHead>
          {canBulk ? <DataTableHeader className="w-8" /> : null}
          <DataTableHeader>
            <SortButton k="name" sort={sort}>Member</SortButton>
          </DataTableHeader>
          <DataTableHeader>Company</DataTableHeader>
          <DataTableHeader>Archetype</DataTableHeader>
          <DataTableHeader>
            <SortButton k="score" sort={sort}>Score</SortButton>
          </DataTableHeader>
          <DataTableHeader align="right">
            <SortButton k="events" sort={sort} reverse>Events</SortButton>
          </DataTableHeader>
          <DataTableHeader>
            <SortButton k="lastSeen" sort={sort}>Last seen</SortButton>
          </DataTableHeader>
          <DataTableHeader>
            <SortButton k="joined" sort={sort}>Joined</SortButton>
          </DataTableHeader>
        </DataTableHead>
        <DataTableBody>
          {visible.map((m) => (
            <DataTableRow key={m.id}>
              {canBulk ? (
                <DataTableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    aria-label={`Select ${m.fullName}`}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                  />
                </DataTableCell>
              ) : null}
              <DataTableCell>
                <Link
                  href={`/operator/members/${m.id}`}
                  className="flex items-center gap-3"
                >
                  <Avatar name={m.fullName} email={m.email} size={32} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-text-primary">
                      <span className="truncate font-medium">{m.fullName}</span>
                      {m.isVip ? (
                        <span
                          title="Purple list"
                          style={{ color: 'var(--accent, #C7A7DE)' }}
                        >
                          ✦
                        </span>
                      ) : null}
                      {m.isBlocked ? (
                        <span
                          title="Blocked"
                          className="rounded bg-danger-soft px-1 text-[9px] font-semibold uppercase text-danger"
                        >
                          blocked
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-text-muted">
                      {m.email}
                    </div>
                  </div>
                </Link>
              </DataTableCell>
              <DataTableCell>
                <InlineEditCell
                  memberId={m.id}
                  field="companyName"
                  initialValue={m.companyName}
                  canEdit={canEdit}
                  placeholder="Add company"
                />
              </DataTableCell>
              <DataTableCell tone="secondary">
                {m.archetype ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                    {archetypeDisplayName(m.archetype)}
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </DataTableCell>
              <DataTableCell>
                <ScoreBadge value={m.aiScore} size="sm" />
              </DataTableCell>
              <DataTableCell align="right">{m.totalEventsAttended}</DataTableCell>
              <DataTableCell tone="tertiary">{fmtDate(m.lastAttendedDate)}</DataTableCell>
              <DataTableCell tone="tertiary">{fmtDate(m.createdAt)}</DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTableShell>

      {visible.length === 0 ? (
        <p className="mt-4 text-center text-sm text-text-muted">
          No members match{query.trim() ? ` “${query.trim()}”` : ' this filter'}.
        </p>
      ) : null}

      {confirm ? (
        <ConfirmModal
          title={`${ACTION_LABEL[confirm]} ${count} member${count === 1 ? '' : 's'}?`}
          subtitle="You can reverse this from the member detail page."
          confirmLabel={ACTION_LABEL[confirm]}
          confirmTone="danger"
          onConfirm={() => run(confirm)}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  );
}
