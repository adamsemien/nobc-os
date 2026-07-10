'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export type PeopleFilters = {
  q: string;
  source: string;
  verified: string; // '' | 'verified' | 'unverified'
  membership: string; // '' | 'member' | 'none'
  consent: string; // '' | 'subscribed' | 'none'
  sort: string; // '' (added, newest first) | 'name'
};

/** Server-side list controls: every change lands in the URL and the server
 *  component re-queries. No saved views, no custom columns — later campaign. */
export function PeopleToolbar({
  filters,
  sourceOptions,
}: {
  filters: PeopleFilters;
  sourceOptions: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(next: Partial<PeopleFilters>) {
    const merged = { ...filters, q, ...next };
    const params = new URLSearchParams();
    if (merged.q.trim()) params.set('q', merged.q.trim());
    if (merged.source) params.set('source', merged.source);
    if (merged.verified) params.set('verified', merged.verified);
    if (merged.membership) params.set('membership', merged.membership);
    if (merged.consent) params.set('consent', merged.consent);
    if (merged.sort) params.set('sort', merged.sort);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Debounced search — the rest of the controls apply immediately.
  useEffect(() => {
    if (q === filters.q) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => apply({}), 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chipBase =
    'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors';

  function Chip({
    active,
    label,
    onClick,
  }: {
    active: boolean;
    label: string;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={chipBase}
        style={
          active
            ? {
                borderColor: 'var(--primary)',
                color: 'var(--primary)',
                background: 'color-mix(in srgb, var(--primary) 6%, transparent)',
              }
            : { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
        }
      >
        {label}
      </button>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary, var(--text-muted))' }}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          className="h-9 w-64 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
      </label>

      <select
        value={filters.source}
        onChange={(e) => apply({ source: e.target.value })}
        className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text-secondary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
      >
        <option value="">All sources</option>
        {sourceOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <Chip
          active={filters.verified === 'verified'}
          label="Verified"
          onClick={() =>
            apply({ verified: filters.verified === 'verified' ? '' : 'verified' })
          }
        />
        <Chip
          active={filters.verified === 'unverified'}
          label="Unverified"
          onClick={() =>
            apply({ verified: filters.verified === 'unverified' ? '' : 'unverified' })
          }
        />
        <Chip
          active={filters.membership === 'member'}
          label="Has membership"
          onClick={() =>
            apply({ membership: filters.membership === 'member' ? '' : 'member' })
          }
        />
        <Chip
          active={filters.membership === 'none'}
          label="CRM only"
          onClick={() => apply({ membership: filters.membership === 'none' ? '' : 'none' })}
        />
        <Chip
          active={filters.consent === 'subscribed'}
          label="Subscribed"
          onClick={() => apply({ consent: filters.consent === 'subscribed' ? '' : 'subscribed' })}
        />
        <Chip
          active={filters.consent === 'none'}
          label="No consent on file"
          onClick={() => apply({ consent: filters.consent === 'none' ? '' : 'none' })}
        />
      </div>

      <div className="ml-auto">
        <select
          value={filters.sort}
          onChange={(e) => apply({ sort: e.target.value })}
          className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text-secondary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        >
          <option value="">Newest first</option>
          <option value="name">By name</option>
        </select>
      </div>
    </div>
  );
}
