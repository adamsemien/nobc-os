'use client';

import Link from 'next/link';

import { MemberShellFooter, MemberShellNav } from './MemberShell';

export type MemberEventsExplorerRow = {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  location: string | null;
  accessMode: 'OPEN' | 'TICKETED';
  showCapacity: boolean;
  capacity: number | null;
  confirmedRsvpCount: number;
  heroImageUrl: string | null;
  priceInCents: number | null;
};

function formatDateLine(iso: string): string {
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d).toUpperCase();
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d).toUpperCase();
  const day = d.getDate();
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return `${weekday} · ${month} ${day} · ${time}`;
}

// Display labels — never surface the raw AccessMode enum in member copy.
function accessBadgeLabel(accessMode: MemberEventsExplorerRow['accessMode']): string {
  switch (accessMode) {
    case 'OPEN':
      return 'Open';
    case 'TICKETED':
      return 'Ticketed';
    default:
      return 'Event';
  }
}

function EventCard({ row }: { row: MemberEventsExplorerRow }) {
  const dateLine = formatDateLine(row.startAt);
  const badge = accessBadgeLabel(row.accessMode);

  return (
    <Link
      href={`/m/events/${row.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-events-ref-rule bg-events-ref-cream-warm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nobc-red)]"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        {row.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.heroImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="events-ref-ph absolute inset-0 flex items-end p-5" aria-hidden>
            <p
              className="line-clamp-2 text-xl font-normal italic leading-snug text-events-ref-ink"
              style={{ fontFamily: "'PP Editorial New', Georgia, serif" }}
            >
              {row.title}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h2
          className="text-[24px] font-normal italic leading-tight tracking-tight text-events-ref-ink"
          style={{ fontFamily: "'PP Editorial New', Georgia, serif" }}
        >
          {row.title}
        </h2>
        <p className="text-[12px] font-normal uppercase tracking-[0.18em] text-events-ref-muted">
          {dateLine}
        </p>
        {row.location ? (
          <p className="text-[12px] font-normal uppercase tracking-[0.18em] text-events-ref-muted">
            {row.location.toUpperCase()}
          </p>
        ) : null}
        <div className="mt-auto pt-3">
          <span className="inline-block rounded-full border border-[var(--nobc-red)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--nobc-red)]">
            {badge}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function MemberEventsExplorer({
  events,
  applyHref,
}: {
  events: MemberEventsExplorerRow[];
  applyHref: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#F9F7F2] text-events-ref-ink">
      <MemberShellNav applyHref={applyHref} />

      <header className="w-full px-6 pb-8 pt-6 sm:px-10 sm:pt-8 lg:px-16 xl:px-24">
        <h1
          className="text-[clamp(2rem,5vw,3.5rem)] font-normal italic leading-tight tracking-tight text-events-ref-ink"
          style={{ fontFamily: "'PP Editorial New', Georgia, serif" }}
        >
          What&apos;s On<span style={{ color: 'var(--nobc-red)', fontStyle: 'normal' }}>.</span>
        </h1>
      </header>

      <main className="w-full flex-1 px-6 pb-16 sm:px-10 sm:pb-20 lg:px-16 xl:px-24">
        {events.length === 0 ? (
          <p className="py-20 text-center text-sm tracking-wide text-events-ref-muted">
            Nothing scheduled yet. Stay close.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 xl:grid-cols-3">
            {events.map(row => <EventCard key={row.id} row={row} />)}
          </div>
        )}
      </main>

      <MemberShellFooter applyHref={applyHref} />
    </div>
  );
}
