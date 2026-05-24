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

        {/* Scrim — only over a photo (the red panel carries its own vignette) */}
        {event.heroImageUrl ? (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2"
            style={{
              background:
                'linear-gradient(to top, rgba(28,16,8,0.80), rgba(28,16,8,0.0))',
            }}
          />
        ) : null}

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

      {/* Body */}
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-12 sm:px-10 sm:pt-16">
        <div className="grid gap-12 lg:grid-cols-[3fr_2fr]">
          <div className="ev-stagger">
            {event.description ? (
              <p className="whitespace-pre-wrap text-[19px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                {event.description}
              </p>
            ) : null}

            {event.runOfShow ? (
              <div className="mt-10 border-t border-[var(--apply-rule)] pt-8">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  Run of show
                </p>
                <pre className="mt-3 whitespace-pre-wrap text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                  {event.runOfShow}
                </pre>
              </div>
            ) : null}

            {event.workflowPaths?.length ? (
              <div className="mt-10">
                <WorkflowPathsCard paths={event.workflowPaths} />
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-8 lg:self-start lg:max-w-sm">
            <RsvpCard event={event} />
          </aside>
        </div>
      </div>

      {/* Footer — minimal mark + email */}
      <footer className="border-t border-[var(--apply-rule)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-10 sm:px-10">
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
  );
}
