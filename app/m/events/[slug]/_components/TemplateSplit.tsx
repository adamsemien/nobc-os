'use client';

import { MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';
import { RsvpCard } from './RsvpCard';
import { WorkflowPathsCard } from './WorkflowPathsCard';
import { EventHeroFallback } from './EventHeroFallback';
import { parseDate, formatDateLine, formatTimeLine } from './event-format';
import type { EventDetailDTO } from './EventDetail';
import { accessTypeLabel } from '@/lib/event-access';

function MetaTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-[var(--apply-rule)] px-3 py-1 text-[11px] uppercase tracking-widest text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
      {children}
    </span>
  );
}

export function TemplateSplit({ event }: { event: EventDetailDTO }) {
  const applyHref = useMemberApplyHref();
  const start = parseDate(event.startAt);

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)] lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Left: full-bleed hero — or the deep-red NoBC mark panel. 45% on desktop,
          full-bleed on top for mobile. */}
      <div className="relative lg:h-screen lg:w-[45%] lg:shrink-0 lg:overflow-hidden">
        {event.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.heroImageUrl}
            alt=""
            className="h-[42vh] w-full object-cover sm:h-[52vh] lg:h-full"
          />
        ) : (
          <EventHeroFallback className="h-[42vh] w-full sm:h-[52vh] lg:h-full" />
        )}
      </div>

      {/* Right: content — 55% on desktop, scrolls independently. */}
      <div className="flex flex-1 flex-col lg:h-screen lg:w-[55%] lg:overflow-y-auto">
        <MemberShellNav applyHref={applyHref} />

        <div className="ev-stagger flex flex-1 flex-col px-6 pb-14 pt-8 sm:px-12 sm:pt-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            {accessTypeLabel(event.resolved)}
          </p>

          <h1 className="mt-5 max-w-2xl text-[clamp(2.5rem,4.6vw,3.75rem)] leading-[1.04] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            {event.title}
          </h1>

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <MetaTag>{formatDateLine(start, { year: false })}</MetaTag>
            <MetaTag>{formatTimeLine(start)}</MetaTag>
            {event.location ? <MetaTag>{event.location}</MetaTag> : null}
          </div>

          <div className="my-8 h-px w-full bg-[var(--apply-rule)]" />

          {event.description ? (
            <p className="max-w-2xl whitespace-pre-wrap text-[17px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              {event.description}
            </p>
          ) : null}

          <div className="mt-10 max-w-md">
            <RsvpCard event={event} />
          </div>

          {event.workflowPaths?.length ? (
            <div className="mt-10 max-w-md">
              <WorkflowPathsCard paths={event.workflowPaths} />
            </div>
          ) : null}

          <footer className="mt-auto border-t border-[var(--apply-rule)] pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.65rem] font-normal uppercase tracking-[0.16em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                <span className="text-[var(--nobc-red)]">NO BAD </span>
                <span>COMPANY</span>
              </p>
              <a
                href="mailto:team@thenobadcompany.com"
                className="text-[13px] text-[var(--apply-muted)] underline-offset-4 transition-colors hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
              >
                team@thenobadcompany.com
              </a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
