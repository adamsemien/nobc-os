'use client';

import { MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';
import { RsvpCard } from './RsvpCard';
import { WorkflowPathsCard } from './WorkflowPathsCard';
import { EventHeroFallback } from './EventHeroFallback';
import { parseDate, formatDateLine, formatTimeLine } from './event-format';
import type { EventDetailDTO } from './EventDetail';
import { accessTypeLabel } from '@/lib/event-access';

export function TemplateSplit({ event }: { event: EventDetailDTO }) {
  const applyHref = useMemberApplyHref();
  const start = parseDate(event.startAt);

  // date · time · venue on a single line (location wired in from the model).
  const metaLine = [formatDateLine(start, { year: false }), formatTimeLine(start), event.location]
    .filter(Boolean)
    .join('  ·  ');

  const showCapacity = event.showCapacity && event.capacity != null;
  const description = event.description?.trim() ?? '';

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)] lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Left: full-height hero — true 50/50 on desktop, ~40vh full-bleed on mobile.
          Branded fallback panel when there's no hero image. */}
      <div className="relative w-full lg:h-screen lg:w-1/2 lg:shrink-0 lg:overflow-hidden">
        {event.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.heroImageUrl}
            alt=""
            className="h-[40vh] w-full object-cover sm:h-[44vh] lg:h-full"
          />
        ) : (
          <EventHeroFallback className="h-[40vh] w-full sm:h-[44vh] lg:h-full" />
        )}
      </div>

      {/* Right: content — true 50/50; scrolls independently on desktop. Left-aligned
          throughout. pb-28 on mobile clears the sticky CTA bar. */}
      <div className="flex flex-1 flex-col lg:h-screen lg:w-1/2 lg:overflow-y-auto">
        <MemberShellNav applyHref={applyHref} />

        <div className="ev-stagger flex flex-1 flex-col px-6 pb-28 pt-8 text-left sm:px-12 sm:pt-12 lg:pb-14">
          {/* category tag */}
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {accessTypeLabel(event.resolved)}
          </p>

          {/* title */}
          <h1 className="mt-4 max-w-2xl text-[clamp(2.75rem,5vw,4.25rem)] font-medium leading-[1.02] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            {event.title}
          </h1>

          {/* date · time · venue */}
          <p className="mt-5 text-[13px] uppercase tracking-[0.14em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            {metaLine}
          </p>

          {/* thin rule */}
          <div className="my-7 h-px w-full bg-[var(--apply-rule)]" />

          {/* capacity callout (distinct, not buried) */}
          {showCapacity ? (
            <p className="mb-7 inline-flex w-fit items-center gap-2 text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--nobc-red)]" aria-hidden />
              Limited to {event.capacity} spots
            </p>
          ) : null}

          {/* description — the guest reads what the event is before hitting the CTA */}
          {description ? (
            <p className="max-w-2xl whitespace-pre-wrap text-[17px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              {description}
            </p>
          ) : null}

          {/* CTA / ticket card — capped + left-aligned; sticky on mobile */}
          <div className="mt-8 w-full max-w-[400px]">
            <RsvpCard event={event} hideHeader mobileSticky />
          </div>

          {/* how to attend (borderless, numbered steps) */}
          {event.workflowPaths?.length ? (
            <div className="mt-10 max-w-2xl">
              <WorkflowPathsCard paths={event.workflowPaths} variant="bare" />
            </div>
          ) : null}

          {/* bottom brand anchor — fills the lower panel intentionally on short-copy
              events, and reads as a closing mark on long-copy ones. */}
          <div className="mt-auto pt-20">
            <div className="h-px w-full bg-[var(--apply-rule)]" />
            <div className="flex items-end justify-between gap-6 pt-6">
              <div>
                <p className="text-[clamp(1.5rem,2.6vw,2.25rem)] italic leading-none text-[var(--apply-muted)] font-[family-name:var(--font-cormorant)]">
                  No Bad Company
                </p>
                <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  {event.location ? `${event.location} · Austin` : 'Austin'}
                </p>
              </div>
              <a
                href="mailto:team@thenobadcompany.com"
                className="shrink-0 text-[13px] text-[var(--apply-muted)] underline-offset-4 transition-colors hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
              >
                team@thenobadcompany.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
