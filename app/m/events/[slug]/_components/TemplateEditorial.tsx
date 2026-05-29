'use client';

import { MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';
import { RsvpCard } from './RsvpCard';
import { WorkflowPathsCard } from './WorkflowPathsCard';
import { EventHeroFallback } from './EventHeroFallback';
import { parseDate, formatDateLine } from './event-format';
import type { EventDetailDTO } from './EventDetail';

export function TemplateEditorial({ event }: { event: EventDetailDTO }) {
  const applyHref = useMemberApplyHref();
  const start = parseDate(event.startAt);
  const dateCaps = formatDateLine(start);
  const venueCaps = event.location ? event.location.toUpperCase() : null;

  return (
    <div className="flex min-h-screen flex-col bg-events-paper text-[var(--apply-ink)]">
      {/* Hero — full-bleed photograph, or the deep-red NoBC mark panel */}
      <section
        className="relative isolate w-full"
        aria-label="Event hero"
        style={{ height: '58vh', minHeight: 380 }}
      >
        {event.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <EventHeroFallback className="absolute inset-0 h-full w-full" />
        )}

        <div className="absolute inset-x-0 top-0 z-10">
          <MemberShellNav applyHref={applyHref} theme="dark" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-10 sm:px-10 sm:pb-14">
          <div className="ev-stagger mx-auto max-w-6xl">
            <h1 className="max-w-4xl text-[clamp(2.75rem,5.8vw,4.75rem)] font-normal leading-[1.04] text-white font-[family-name:var(--font-cormorant)]">
              {event.title}
            </h1>
            <p className="mt-4 text-[12px] font-medium uppercase tracking-[0.2em] text-white/85 font-[family-name:var(--font-dm-sans)]">
              {dateCaps}
              {venueCaps ? ` · ${venueCaps}` : ''}
            </p>
          </div>
        </div>
      </section>

      {/* Body — two-column on desktop (detail left, sticky card right);
          single-column stacked on mobile/tablet. The full-width hero above is unchanged. */}
      <div className="ev-stagger mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-16 pt-12 sm:px-10 sm:pt-16 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-16">
        {/* description — col 1, row 1 */}
        {event.description ? (
          <p className="max-w-2xl whitespace-pre-wrap text-[19px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)] lg:col-start-1 lg:row-start-1">
            {event.description}
          </p>
        ) : null}

        {/* access / ticket card — col 2, sticky; spans both content rows on desktop */}
        <div className="mt-8 w-full max-w-[400px] lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0 lg:sticky lg:top-8">
          <RsvpCard event={event} mobileSticky={true} />
        </div>

        {/* detail + brand anchor — col 1, row 2 */}
        <div className="flex flex-1 flex-col lg:col-start-1 lg:row-start-2">
          {event.runOfShow ? (
            <div className="mt-10 max-w-2xl border-t border-[var(--apply-rule)] pt-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                Run of show
              </p>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                {event.runOfShow}
              </pre>
            </div>
          ) : null}

          {event.workflowPaths?.length && event.resolved.kind !== 'closed' ? (
            <div className="mt-10 max-w-2xl">
              <WorkflowPathsCard paths={event.workflowPaths} />
            </div>
          ) : null}

          {/* bottom brand anchor — hairline + muted wordmark + location; fills the
              lower panel intentionally on short-copy events (same as Split). */}
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
