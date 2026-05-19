import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { operatorServerFetch } from '@/lib/operator-server-fetch';
import { PageHeader } from '../_components/PageHeader';

type Row = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  location: string | null;
  capacity: number | null;
  checkedIn: number;
  confirmed: number;
};

function bucket(iso: string): 'today' | 'upcoming' {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString() ? 'today' : 'upcoming';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function CheckInHubPage() {
  const res = await operatorServerFetch('/api/operator/check-in');
  if (!res.ok) {
    return (
      <div className="px-4 py-16 text-center text-sm text-text-secondary">
        Could not load events.
      </div>
    );
  }
  const { events } = (await res.json()) as { events: Row[] };
  const today = events.filter((e) => bucket(e.startAt) === 'today');
  const upcoming = events.filter((e) => bucket(e.startAt) === 'upcoming');

  return (
    <div className="px-6 pb-16 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1100px]">
        <PageHeader
          title="Check-in"
          subtitle="Doors and dashboards for every active event."
        />

        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
            <p className="text-sm text-text-secondary">No upcoming events.</p>
            <Link
              href="/operator/events/new"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              Create an event →
            </Link>
          </div>
        ) : null}

        {today.length > 0 ? (
          <section className="mb-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Tonight
            </h2>
            <div className="space-y-3">
              {today.map((e) => (
                <EventRow key={e.id} row={e} accent />
              ))}
            </div>
          </section>
        ) : null}

        {upcoming.length > 0 ? (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              Upcoming
            </h2>
            <div className="space-y-3">
              {upcoming.map((e) => (
                <EventRow key={e.id} row={e} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function EventRow({ row, accent = false }: { row: Row; accent?: boolean }) {
  const fillPct =
    row.capacity && row.capacity > 0
      ? Math.min(100, Math.round((row.checkedIn / row.capacity) * 100))
      : 0;

  return (
    <div
      className={
        'flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4 transition-colors ' +
        (accent ? 'border-primary/40' : 'border-border')
      }
    >
      <div className="min-w-0 flex-1">
        <Link
          href={`/operator/events/${row.id}`}
          className="block truncate text-base font-semibold text-text-primary hover:text-primary"
        >
          {row.title}
        </Link>
        <div className="mt-0.5 text-xs text-text-muted">
          {fmtDate(row.startAt)}
          {row.location ? ` · ${row.location}` : ''}
        </div>
      </div>

      <div className="w-44">
        <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.14em] text-text-muted">
          <span>checked in</span>
          <span className="text-sm font-semibold tabular-nums text-text-primary">
            {row.checkedIn}
            {row.capacity != null ? <span className="text-text-muted">/{row.capacity}</span> : null}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{
              width: `${fillPct}%`,
              background: 'var(--primary)',
            }}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <a
          href={`/check-in/${row.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-text-primary hover:border-primary hover:text-primary"
        >
          Check In
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        <Link
          href={`/operator/events/${row.id}/room`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          The Room →
        </Link>
      </div>
    </div>
  );
}
