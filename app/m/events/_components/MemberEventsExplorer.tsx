'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { MemberShellFooter, MemberShellNav } from './MemberShell';

const EventsMiniCalendar = dynamic(
  () => import('./EventsMiniCalendar').then(m => m.EventsMiniCalendar),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-lg bg-events-card" /> },
);
const UpcomingDateChips = dynamic(
  () => import('./EventsMiniCalendar').then(m => m.UpcomingDateChips),
  { ssr: false },
);

export type MemberEventsExplorerRow = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  location: string | null;
  accessMode: 'OPEN' | 'TICKETED' | 'APPLY_OR_PAY';
  showCapacity: boolean;
  capacity: number | null;
  confirmedRsvpCount: number;
  heroImageUrl: string | null;
  priceInCents: number | null;
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return { date, time };
}

function accessPill(accessMode: MemberEventsExplorerRow['accessMode']): string {
  switch (accessMode) {
    case 'OPEN':
      return 'Open';
    case 'TICKETED':
      return 'Members Only';
    case 'APPLY_OR_PAY':
      return 'Apply to Attend';
    default:
      return 'Event';
  }
}

function ctaLabel(row: MemberEventsExplorerRow): string {
  if (row.accessMode === 'TICKETED' && (row.priceInCents ?? 0) > 0) {
    const usd = (row.priceInCents! / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    return `Get Ticket — ${usd}`;
  }
  if (row.accessMode === 'APPLY_OR_PAY') return 'Apply or reserve';
  return 'Reserve My Spot';
}

function capacityLine(row: MemberEventsExplorerRow): string | null {
  if (!row.showCapacity || !row.capacity) return null;
  const rem = row.capacity - row.confirmedRsvpCount;
  if (rem <= 0) return 'Sold out';
  const pctRem = rem / row.capacity;
  if (pctRem > 0.2) return null;
  return `${rem} spot${rem === 1 ? '' : 's'} left`;
}

function EventRowCard({ row }: { row: MemberEventsExplorerRow }) {
  const { date, time } = formatDateTime(row.startAt);
  const cap = capacityLine(row);
  const pill = accessPill(row.accessMode);
  const cta = ctaLabel(row);

  return (
    <article className="flex flex-col gap-4 border-b border-events-line-soft py-8 last:border-b-0 sm:flex-row sm:items-stretch sm:gap-6 sm:py-10">
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-md border border-events-line-soft bg-events-canvas-deep sm:aspect-[4/3] sm:w-[min(42%,260px)]">
        {row.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.heroImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col justify-end bg-events-canvas-deep p-4">
            <p
              className="line-clamp-3 text-left text-xl font-normal leading-snug tracking-tight text-events-fg sm:text-2xl"
              style={{ fontFamily: 'var(--font-playfair-display), Georgia, serif' }}
            >
              {row.title}
            </p>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-events-line-soft bg-events-card px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-events-fg-soft">
            {pill}
          </span>
          {cap ? (
            <span className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-events-warm-accent">
              {cap}
            </span>
          ) : null}
        </div>
        <h2
          className="font-playfair text-2xl font-normal leading-tight tracking-tight text-events-fg sm:text-[1.65rem]"
          style={{ fontFamily: 'var(--font-playfair-display), Georgia, serif' }}
        >
          <Link
            href={`/m/events/${row.slug}`}
            className="transition-colors hover:text-events-warm-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-events-warm-accent"
          >
            {row.title}
          </Link>
        </h2>
        <p className="text-[0.65rem] font-normal uppercase tracking-[0.22em] text-events-fg-quiet">
          {date} · {time}
          {row.location ? ` · ${row.location}` : ''}
        </p>
        <div className="pt-2">
          <Link
            href={`/m/events/${row.slug}`}
            className="inline-flex min-h-11 items-center justify-center border border-events-cta-border bg-transparent px-6 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-events-cta-fg transition-colors hover:bg-events-cta-hover"
            style={{ borderRadius: '6px' }}
          >
            {cta}
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function MemberEventsExplorer({
  events,
  applyHref,
}: {
  events: MemberEventsExplorerRow[];
  applyHref: string;
}) {
  const mini = events.map(e => ({ id: e.id, startAt: e.startAt }));

  return (
    <div className="flex min-h-screen flex-col bg-events-canvas text-events-fg">
      <MemberShellNav applyHref={applyHref} theme="dark" />

      <header className="mx-auto w-full max-w-6xl px-6 pb-6 pt-4 sm:px-8">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.35em] text-events-warm-accent">Events</p>
        <h1
          className="mt-3 max-w-2xl text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-tight tracking-tight text-events-fg"
          style={{ fontFamily: 'var(--font-playfair-display), Georgia, serif' }}
        >
          Upcoming gatherings
        </h1>
        <p className="mt-3 max-w-xl text-sm font-normal leading-relaxed text-events-fg-soft">
          Reserve your seat, request access, or complete checkout — all from each event page.
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col gap-6 px-6 pb-16 sm:px-8 lg:flex-row lg:gap-10 lg:pb-20">
        <section className="min-w-0 flex-1 lg:max-w-none">
          <UpcomingDateChips events={mini} />
          <div className="mt-6 lg:mt-0">
            {events.length === 0 ? (
              <p className="py-12 text-center text-sm text-events-fg-soft">No upcoming events in this window.</p>
            ) : (
              events.map(row => <EventRowCard key={row.id} row={row} />)
            )}
          </div>
        </section>
        <aside className="hidden w-full shrink-0 lg:block lg:w-[300px]">
          <div className="sticky top-6">
            <EventsMiniCalendar events={mini} />
          </div>
        </aside>
      </main>

      <MemberShellFooter applyHref={applyHref} theme="dark" />
    </div>
  );
}
