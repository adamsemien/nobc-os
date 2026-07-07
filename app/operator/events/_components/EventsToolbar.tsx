'use client';

/** URL-driven controls for the events list — search, status/date filters,
 *  sort, result count, and pager. State lives in the query string so the
 *  server page re-fetches with the same params (and links are shareable). */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

const selectCls =
  'h-9 rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:border-primary focus:outline-none';

export function EventsToolbar({
  total,
  page,
  pageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // Any filter change resets to the first page.
    if (key !== 'page') params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `/operator/events?${qs}` : '/operator/events');
  };

  // Debounced search → URL. Skips when the input already matches the URL so
  // the initial mount never triggers a spurious navigation.
  useEffect(() => {
    const current = sp.get('q') ?? '';
    if (q === current) return;
    const t = window.setTimeout(() => setParam('q', q.trim() || null), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sp]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search events…"
          aria-label="Search events"
          className="h-9 w-56 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
        />
      </div>

      <select
        value={sp.get('status') ?? ''}
        onChange={(e) => setParam('status', e.target.value || null)}
        aria-label="Filter by status"
        className={selectCls}
      >
        <option value="">All statuses</option>
        <option value="published">Published</option>
        <option value="draft">Draft</option>
        <option value="cancelled">Cancelled</option>
      </select>

      <select
        value={sp.get('when') ?? ''}
        onChange={(e) => setParam('when', e.target.value || null)}
        aria-label="Filter by date"
        className={selectCls}
      >
        <option value="">All dates</option>
        <option value="upcoming">Upcoming</option>
        <option value="past">Past</option>
      </select>

      <select
        value={sp.get('sort') ?? ''}
        onChange={(e) => setParam('sort', e.target.value || null)}
        aria-label="Sort events"
        className={selectCls}
      >
        <option value="">Newest first</option>
        <option value="start_asc">Oldest first</option>
        <option value="title">Title A–Z</option>
      </select>

      <span className="ml-auto text-sm text-text-muted tabular-nums">
        {total.toLocaleString()} event{total === 1 ? '' : 's'}
      </span>

      {totalPages > 1 ? (
        <span className="flex items-center gap-2 text-sm text-text-muted">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setParam('page', String(page - 1))}
            className="rounded px-2 py-1 hover:text-text-primary disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setParam('page', String(page + 1))}
            className="rounded px-2 py-1 hover:text-text-primary disabled:opacity-40"
          >
            Next →
          </button>
        </span>
      ) : null}
    </div>
  );
}
