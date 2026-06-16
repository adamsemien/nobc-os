'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { MemberShellFooter, MemberShellNav, useMemberApplyHref } from './MemberShell';

export type EventCardDTO = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  location: string | null;
  accessMode: 'OPEN' | 'TICKETED';
  approvalRequired: boolean;
  heroImageAssetId: string | null;
};

type Props = { events: EventCardDTO[] };

type ViewMode = 'list' | 'calendar';

function resolveEventDate(dateStr: string): Date | null {
  const y = new Date().getFullYear();
  for (const yy of [y, y + 1]) {
    const withComma = new Date(`${dateStr}, ${yy}`);
    if (!Number.isNaN(withComma.getTime())) return withComma;
    const spaced = new Date(`${dateStr} ${yy}`);
    if (!Number.isNaN(spaced.getTime())) return spaced;
  }
  const direct = new Date(dateStr);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

function formatReferenceMetaLine(dateStr: string, location: string | null): string {
  const d = resolveEventDate(dateStr);
  if (!d) {
    const loc = location?.toUpperCase() ?? '';
    return [dateStr.toUpperCase(), loc].filter(Boolean).join(' · ');
  }
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d).toUpperCase();
  const dayNum = d.getDate();
  const mon = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d).toUpperCase();
  const yr = d.getFullYear();
  const loc = location ? location.toUpperCase() : '';
  return `${weekday} · ${dayNum} ${mon} · ${yr}${loc ? ` ${loc}` : ''}`;
}

/** First 80 characters of trimmed description, plus ellipsis when truncated. */
function listingDescriptionTeaser(description: string | null | undefined): string | null {
  if (description == null) return null;
  const t = description.trim();
  if (t.length === 0) return null;
  if (t.length <= 80) return t;
  return `${t.slice(0, 80)}…`;
}

function EventHeroImage({ heroImageAssetId }: { heroImageAssetId: string | null }) {
  const src = heroImageAssetId?.trim() || null;
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden bg-events-ref-cream-warm">
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      ) : (
        <div className="events-ref-ph absolute inset-0" aria-hidden />
      )}
    </div>
  );
}

function EventCopyBlock({ event }: { event: EventCardDTO }) {
  const meta = formatReferenceMetaLine(event.date, event.location);
  const teaser = listingDescriptionTeaser(event.description);
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 sm:gap-4">
      <p className="text-[0.65rem] font-normal uppercase tracking-[0.28em] text-events-ref-muted">
        {meta}
      </p>
      <h2 className="font-playfair text-2xl font-normal leading-snug tracking-tight text-events-ref-ink md:text-[1.65rem]">
        {event.title}
      </h2>
      {teaser ? (
        <p className="line-clamp-2 text-sm font-normal leading-relaxed text-events-ref-muted md:line-clamp-1">
          {teaser}
        </p>
      ) : null}
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-events-ref-ink">
        VIEW <span aria-hidden>→</span>
      </p>
    </div>
  );
}

export function EventsGrid({ events }: Props) {
  const [view, setView] = useState<ViewMode>('list');
  const applyHref = useMemberApplyHref();

  if (events.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-events-ref-cream text-events-ref-ink">
        <MemberShellNav applyHref={applyHref} />
        <header className="mx-auto w-full max-w-6xl px-6 pb-10 pt-2 sm:px-8">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.35em] text-events-ref-accent">EVENTS</p>
          <h1 className="mt-4 max-w-3xl font-playfair text-[clamp(2.25rem,5.2vw,3.5rem)] font-normal italic leading-[1.12] tracking-tight text-events-ref-ink">
            Dinners, rooms, and quiet weekends.
          </h1>
        </header>
        <main className="mx-auto flex flex-1 max-w-6xl flex-col items-center justify-center px-6 py-16 text-center sm:px-8">
          <p className="max-w-md text-sm font-normal leading-relaxed tracking-wide text-events-ref-muted">
            No upcoming events. Check back soon.
          </p>
        </main>
        <MemberShellFooter applyHref={applyHref} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-events-ref-cream text-events-ref-ink">
      <MemberShellNav applyHref={applyHref} />

      <header className="mx-auto flex max-w-6xl flex-col gap-8 px-6 pb-8 pt-2 sm:px-8 lg:flex-row lg:items-start lg:justify-between lg:pb-12">
        <div className="max-w-3xl">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.35em] text-events-ref-accent">EVENTS</p>
          <h1 className="mt-4 font-playfair text-[clamp(2.35rem,5.5vw,3.75rem)] font-normal italic leading-[1.1] tracking-tight text-events-ref-ink">
            Dinners, rooms, and quiet weekends.
          </h1>
        </div>
        <div
          className="flex shrink-0 items-center gap-2 self-start lg:pt-2"
          role="group"
          aria-label="Events view"
        >
          <button
            type="button"
            onClick={() => setView('list')}
            className={
              view === 'list'
                ? 'inline-flex items-center min-h-[44px] px-2 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-events-ref-ink'
                : 'inline-flex items-center min-h-[44px] px-2 text-[0.65rem] font-normal uppercase tracking-[0.28em] text-events-ref-muted transition-colors hover:text-events-ref-ink'
            }
          >
            LIST
          </button>
          <span className="text-[0.65rem] font-light text-events-ref-faint" aria-hidden>
            |
          </span>
          <button
            type="button"
            onClick={() => setView('calendar')}
            className={
              view === 'calendar'
                ? 'inline-flex items-center min-h-[44px] px-2 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-events-ref-ink'
                : 'inline-flex items-center min-h-[44px] px-2 text-[0.65rem] font-normal uppercase tracking-[0.28em] text-events-ref-muted transition-colors hover:text-events-ref-ink'
            }
          >
            CALENDAR
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 sm:px-8 sm:pb-24">
        {view === 'list' ? (
          <ul className="flex flex-col">
            {events.map(event => (
              <li key={event.id} className="min-w-0">
                <Link
                  href={`/m/events/${event.slug}`}
                  className="group flex flex-col gap-8 border-b border-events-ref-rule py-10 transition-colors last:border-b-0 sm:flex-row sm:items-stretch sm:gap-10 sm:py-12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-events-ref-accent"
                >
                  <div className="w-full shrink-0 sm:w-[min(38%,14rem)] md:w-[min(38%,16rem)]">
                    <EventHeroImage heroImageAssetId={event.heroImageAssetId} />
                  </div>
                  <EventCopyBlock event={event} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 md:gap-y-16 lg:grid-cols-3">
            {events.map(event => (
              <li key={event.id} className="min-w-0">
                <Link
                  href={`/m/events/${event.slug}`}
                  className="group flex flex-col gap-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-events-ref-accent"
                >
                  <EventHeroImage heroImageAssetId={event.heroImageAssetId} />
                  <EventCopyBlock event={event} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <MemberShellFooter applyHref={applyHref} />
    </div>
  );
}
