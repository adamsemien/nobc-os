'use client';

import { MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';
import { RsvpCard } from './RsvpCard';
import { WorkflowPathsCard } from './WorkflowPathsCard';
import { EventHeroFallback } from './EventHeroFallback';
import { parseDate, formatDateLine, formatTimeLine } from './event-format';
import type { EventDetailDTO } from './EventDetail';
import { accessTypeLabel } from '@/lib/event-access';
import { ACTIVE_EVENT_ID } from '@/lib/active-event';
import { DoorFork } from '@/app/e/[slug]/_components/DoorFork';

// Render-only brand two-tone: a leading "No Bad" prints in NoBC red, the rest in
// ink. Generic so any "No Bad ___" title splits (e.g. "No Bad Saturday"); titles
// that don't start with "No Bad" render entirely in ink. Does NOT alter the
// stored title copy - this is colour only.
function renderBrandTitle(title: string) {
  const prefix = 'No Bad';
  if (title.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
    return (
      <>
        <span className="text-[var(--nobc-red)]">{title.slice(0, prefix.length)}</span>
        {title.slice(prefix.length)}
      </>
    );
  }
  return title;
}

export function TemplateSplit({ event }: { event: EventDetailDTO }) {
  const applyHref = useMemberApplyHref();
  const start = parseDate(event.startAt);

  // date · time · venue on a single line (location wired in from the model).
  const metaLine = [formatDateLine(start, { year: false }), formatTimeLine(start), event.location]
    .filter(Boolean)
    .join('  ·  ');

  const showCapacity = event.showCapacity && event.capacity != null;
  const description = event.description?.trim() ?? '';

  // Active-event-only presentational tweaks: the portrait launch poster shows in
  // full (contain, not cropped) and the public (anon) view gets the two-choice
  // fork in the access-card slot. The public loader forces viewer = 'anon', and
  // the member page is auth-gated, so this never alters the member surface.
  const isActiveEvent = event.eventId === ACTIVE_EVENT_ID;
  const showFork = isActiveEvent && event.viewer === 'anon';

  return (
    <div className="flex min-h-dvh flex-col bg-events-paper text-[var(--apply-ink)] lg:h-dvh lg:flex-row lg:overflow-hidden">
      {/* Left: full-height hero — true 50/50 on desktop, ~40vh full-bleed on mobile.
          Plain paper behind the poster (any object-contain letterbox reads as
          paper, not a matte). Branded fallback panel when there's no hero image.
          Desktop height is capped in absolute viewport units (lg:h-dvh +
          lg:max-h-dvh) rather than lg:h-full - a percentage height can fail to
          constrain inside the flex row and let a portrait poster overflow into a
          scroll. Mobile band (h-[40vh]/sm:h-[44vh]) is unchanged. */}
      <div className="relative w-full bg-events-paper lg:h-dvh lg:w-1/2 lg:shrink-0 lg:overflow-hidden">
        {event.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.heroImageUrl}
            alt=""
            className={`h-[40vh] w-full sm:h-[44vh] lg:h-dvh lg:max-h-dvh ${isActiveEvent ? 'object-contain object-center' : 'object-cover'}`}
          />
        ) : (
          <EventHeroFallback className="h-[40vh] w-full sm:h-[44vh] lg:h-full" />
        )}
      </div>

      {/* Right: content — true 50/50; scrolls independently on desktop. Left-aligned
          throughout. pb-28 on mobile clears the sticky CTA bar. */}
      <div className="flex flex-1 flex-col lg:h-dvh lg:w-1/2 lg:overflow-y-auto">
        {event.viewer !== 'anon' ? <MemberShellNav applyHref={applyHref} /> : null}

        <div className="ev-stagger flex flex-1 flex-col px-6 pb-28 pt-8 text-left sm:px-12 sm:pt-12 lg:pb-14">
          {/* category tag */}
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            {accessTypeLabel(event.resolved)}
          </p>

          {/* title */}
          <h1
            className="mt-4 max-w-2xl font-normal leading-[1.02] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]"
            style={{ fontSize: 'calc(clamp(2.75rem, 5vw, 4.25rem) * var(--page-title-scale, 1))' }}
          >
            {renderBrandTitle(event.title)}
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

          {/* CTA / ticket card — capped + left-aligned; sticky on mobile. The
              active event's public view shows the two-choice fork here; Choice B
              reveals this same RsvpCard, whose CTA drives the existing buy flow. */}
          <div className="mt-8 w-full max-w-[400px]">
            {showFork ? (
              <DoorFork>
                <RsvpCard event={event} hideHeader mobileSticky />
              </DoorFork>
            ) : (
              <RsvpCard event={event} hideHeader mobileSticky />
            )}
          </div>

          {/* how to attend (borderless, numbered steps) — hidden on ticketed flows
              where the free-entry card would be contradictory */}
          {(() => {
            const isTicketed = event.resolved.kind !== 'closed' && event.resolved.flow.includes('pay');
            return event.workflowPaths?.length && event.resolved.kind !== 'closed' && !isTicketed ? (
              <div className="mt-10 max-w-2xl">
                <WorkflowPathsCard paths={event.workflowPaths} variant="bare" />
              </div>
            ) : null;
          })()}

          {/* bottom brand anchor — fills the lower panel intentionally on short-copy
              events, and reads as a closing mark on long-copy ones. */}
          <div className="mt-16">
            <div className="h-px w-full bg-[var(--apply-rule)]" />
            <div className="flex items-end justify-between gap-6 pt-6">
              <div>
                <p
                  className="italic leading-none font-[family-name:var(--font-cormorant)]"
                  style={{ fontSize: 'calc(clamp(1.5rem, 2.6vw, 2.25rem) * var(--footer-scale, 1))' }}
                >
                  <span className="text-[var(--nobc-red)]">No Bad</span>
                  <span className="text-[var(--apply-ink)]"> Company</span>
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
