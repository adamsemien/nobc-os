'use client';

import Link from 'next/link';
import { RsvpCard } from './RsvpCard';
import { WorkflowPathsCard } from './WorkflowPathsCard';
import { parseDate, formatDateLine, formatTimeLine } from './event-format';
import type { EventDetailDTO } from './EventDetail';
import { accessTypeLabel } from '@/lib/event-access';

export function TemplateMinimal({ event }: { event: EventDetailDTO }) {
  const start = parseDate(event.startAt);

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      {/* Minimal nav — wordmark centered */}
      <header className="mx-auto w-full max-w-xl px-6 pt-10 text-center">
        <Link
          href="/m/events"
          className="text-[10px] uppercase tracking-[0.3em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
        >
          <span className="text-[var(--nobc-red)]">NO BAD </span>
          <span>COMPANY</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-6 pb-20 pt-10 text-center">
        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        <div className="ev-stagger">
          <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            {accessTypeLabel(event.resolved)}
          </p>

          <h1
            className="mt-6 font-normal leading-[1.05] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]"
            style={{ fontSize: 'calc(clamp(2.5rem, 6vw, 4rem) * var(--page-title-scale, 1))' }}
          >
            {event.title}
          </h1>

          <div className="mt-6 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              {formatDateLine(start, { weekday: 'long', month: 'long' })}
            </p>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              {formatTimeLine(start)}
            </p>
            {event.location ? (
              <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                {event.location.toUpperCase()}
              </p>
            ) : null}
          </div>
        </div>

        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        {event.heroImageUrl ? (
          <div className="mx-auto mb-10 aspect-video w-full max-w-md overflow-hidden rounded-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.heroImageUrl} alt="" className="h-full w-full object-cover" />
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

        {event.workflowPaths?.length && event.resolved.kind !== 'closed' ? (
          <div className="mx-auto mt-10 max-w-md text-left">
            <WorkflowPathsCard paths={event.workflowPaths} />
          </div>
        ) : null}

        <div className="my-10 h-px w-full bg-[var(--apply-rule)]" aria-hidden />

        <p
          className="uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]"
          style={{ fontSize: 'calc(10px * var(--footer-scale, 1))' }}
        >
          <span className="text-[var(--nobc-red)]">NO BAD </span>
          <span>COMPANY</span>
        </p>
        <a
          href="mailto:team@thenobadcompany.com"
          className="mt-3 inline-block text-[13px] text-[var(--apply-muted)] underline-offset-4 transition-colors hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
        >
          team@thenobadcompany.com
        </a>
      </main>
    </div>
  );
}
