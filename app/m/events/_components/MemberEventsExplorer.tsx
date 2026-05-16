'use client';

import Link from 'next/link';

import { MemberShellFooter, MemberShellNav } from './MemberShell';

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

function formatDateLine(iso: string): string {
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d).toUpperCase();
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d).toUpperCase();
  const day = d.getDate();
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return `${weekday} · ${month} ${day} · ${time}`;
}

function accessBadgeLabel(accessMode: MemberEventsExplorerRow['accessMode']): string {
  switch (accessMode) {
    case 'OPEN':
      return 'OPEN';
    case 'TICKETED':
      return 'TICKETED';
    case 'APPLY_OR_PAY':
      return 'MEMBERS APPLY';
    default:
      return 'EVENT';
  }
}

function EventCard({ row }: { row: MemberEventsExplorerRow }) {
  const dateLine = formatDateLine(row.startAt);
  const badge = accessBadgeLabel(row.accessMode);

  return (
    <Link
      href={`/m/events/${row.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-events-line-soft bg-events-card transition-shadow hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-events-warm-accent"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-events-canvas-deep">
        {row.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.heroImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-end bg-events-canvas-deep p-5">
            <p
              className="line-clamp-2 text-xl font-normal leading-snug text-events-fg"
              style={{ fontFamily: "'PP Editorial New', Georgia, serif", fontStyle: 'italic' }}
            >
              {row.title}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h2
          className="text-[24px] font-normal leading-tight tracking-tight text-events-fg"
          style={{ fontFamily: "'PP Editorial New', Georgia, serif", fontStyle: 'italic' }}
        >
          {row.title}
        </h2>
        <p className="text-[12px] font-normal uppercase tracking-[0.18em] text-events-fg-soft">
          {dateLine}
        </p>
        {row.location ? (
          <p className="text-[12px] font-normal uppercase tracking-[0.18em] text-events-fg-soft">
            {row.location.toUpperCase()}
          </p>
        ) : null}
        <div className="mt-auto pt-3">
          <span className="inline-block rounded-full border border-events-warm-accent px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-events-warm-accent">
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
    <div className="flex min-h-screen flex-col bg-events-canvas text-events-fg">
      <MemberShellNav applyHref={applyHref} theme="dark" />

      <header className="mx-auto w-full max-w-6xl px-6 pb-8 pt-6 sm:px-8 sm:pt-8">
        <h1
          className="text-[clamp(2rem,5vw,3.5rem)] font-normal leading-tight tracking-tight text-events-fg"
          style={{ fontFamily: "'PP Editorial New', Georgia, serif", fontStyle: 'italic' }}
        >
          What&apos;s On
        </h1>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16 sm:px-8 sm:pb-20">
        {events.length === 0 ? (
          <p className="py-20 text-center text-sm tracking-wide text-events-fg-soft">
            Nothing scheduled yet. Stay close.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
            {events.map(row => <EventCard key={row.id} row={row} />)}
          </div>
        )}
      </main>

      <MemberShellFooter applyHref={applyHref} theme="dark" />
    </div>
  );
}
