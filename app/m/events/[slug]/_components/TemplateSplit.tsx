'use client';

import { MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';
import { RsvpCard } from './RsvpCard';
import { WorkflowPathsCard } from './WorkflowPathsCard';
import { EventHeroFallback } from './EventHeroFallback';
import { parseDate, formatDateLine, formatTimeLine } from './event-format';
import type { EventDetailDTO } from './EventDetail';
import { accessTypeLabel } from '@/lib/event-access';

/** First `n` sentences of a description — the above-the-fold teaser. Falls back
 *  to the whole string if it can't find sentence boundaries. */
function firstSentences(text: string, n: number): string {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!parts) return text.trim();
  const lead = parts.slice(0, n).join('').trim();
  return lead || text.trim();
}

export function TemplateSplit({ event }: { event: EventDetailDTO }) {
  const applyHref = useMemberApplyHref();
  const start = parseDate(event.startAt);

  // 3 — date · time · venue on a single line (location wired in from the model).
  const metaLine = [formatDateLine(start, { year: false }), formatTimeLine(start), event.location]
    .filter(Boolean)
    .join('  ·  ');

  const showCapacity = event.showCapacity && event.capacity != null;

  const fullDescription = event.description?.trim() ?? '';
  const shortDescription = fullDescription ? firstSentences(fullDescription, 3) : '';
  const hasMoreDescription = fullDescription.length > shortDescription.length;

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)] lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Left: full-height hero — true 50/50 on desktop, ~40vh full-bleed on mobile.
          Deep-red NoBC mark panel when there's no hero image. */}
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
          {/* 1 — category tag */}
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {accessTypeLabel(event.resolved)}
          </p>

          {/* 2 — title */}
          <h1 className="mt-4 max-w-2xl text-[clamp(2.75rem,5vw,4.25rem)] font-medium leading-[1.02] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            {event.title}
          </h1>

          {/* 3 — date · time · venue */}
          <p className="mt-5 text-[13px] uppercase tracking-[0.14em] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            {metaLine}
          </p>

          {/* 4 — thin rule */}
          <div className="my-7 h-px w-full bg-[var(--apply-rule)]" />

          {/* 5 — capacity callout (distinct, not buried) */}
          {showCapacity ? (
            <p className="mb-7 inline-flex w-fit items-center gap-2 text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--nobc-red)]" aria-hidden />
              Limited to {event.capacity} spots
            </p>
          ) : null}

          {/* 6 — CTA / ticket card, full width of the right panel + sticky on mobile */}
          <RsvpCard event={event} hideHeader mobileSticky />

          {/* 7 — short description (above the fold) */}
          {shortDescription ? (
            <p className="mt-8 max-w-2xl whitespace-pre-wrap text-[17px] leading-[1.7] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              {shortDescription}
            </p>
          ) : null}

          {/* 8 — how to attend (borderless, numbered steps) */}
          {event.workflowPaths?.length ? (
            <div className="mt-10">
              <WorkflowPathsCard paths={event.workflowPaths} variant="bare" />
            </div>
          ) : null}

          {/* 9 — full description */}
          {hasMoreDescription ? (
            <div className="mt-10 border-t border-[var(--apply-rule)] pt-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                About this gathering
              </p>
              <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[16px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                {fullDescription}
              </p>
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
