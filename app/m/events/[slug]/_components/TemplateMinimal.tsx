'use client';

import Link from 'next/link';
import { RsvpCard } from './RsvpCard';
import type { EventDetailDTO } from './EventDetail';

function parseDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function formatDateLine(d: Date): string {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
    .format(d)
    .toUpperCase();
  const dayNum = d.getDate();
  const mon = new Intl.DateTimeFormat('en-GB', { month: 'long' })
    .format(d)
    .toUpperCase();
  const yr = d.getFullYear();
  return `${weekday} · ${dayNum} ${mon} · ${yr}`;
}

function formatTimeLine(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function getAccessLabel(event: EventDetailDTO): string {
  const r = event.resolved;
  if (r.kind === 'closed') return 'Closed';
  if (/pay/.test(r.gate as string)) return 'Ticketed';
  if (r.gate === 'apply' || /approval$/.test(r.gate as string)) return 'Apply to Attend';
  if (r.kind === 'member') return 'Members';
  return 'Open';
}

export function TemplateMinimal({ event }: { event: EventDetailDTO }) {
  const start = parseDate(event.startAt);

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F7F2] text-[var(--apply-ink)]">
      {/* Minimal nav — just logo centered */}
      <header className="mx-auto w-full max-w-xl px-6 pt-10 text-center">
        <Link
          href="/m/events"
          className="text-[10px] uppercase tracking-[0.3em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
        >
          <span>THE </span>
          <span className="text-[var(--nobc-red)]">NO BAD </span>
          <span>COMPANY</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-20 pt-10 text-center">
        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
          {getAccessLabel(event)}
        </p>

        <h1 className="mt-6 text-[clamp(2.5rem,6vw,4rem)] italic leading-[1.05] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
          {event.title}
        </h1>

        <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          {formatDateLine(start)}
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          {formatTimeLine(start)}
        </p>
        {event.location ? (
          <p className="mt-2 text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {event.location.toUpperCase()}
          </p>
        ) : null}

        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        {event.heroImageUrl ? (
          <div className="mx-auto mb-10 aspect-video w-full max-w-md overflow-hidden rounded-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.heroImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        {event.description ? (
          <p className="mx-auto max-w-md whitespace-pre-wrap text-[16px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            {event.description}
          </p>
        ) : null}

        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        <div className="mx-auto max-w-sm text-left">
          <RsvpCard event={event} variant="borderless" />
        </div>

        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          <span>The </span>
          <span className="text-[var(--nobc-red)]">No Bad </span>
          <span>Company</span>
        </p>
      </main>
    </div>
  );
}
