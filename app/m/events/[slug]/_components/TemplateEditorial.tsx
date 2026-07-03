'use client';

import { MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';
import { RsvpCard } from './RsvpCard';
import { WorkflowPathsCard } from './WorkflowPathsCard';
import { EventHeroFallback } from './EventHeroFallback';
import { parseDate, formatDateLine } from './event-format';
import type { EventDetailDTO } from './EventDetail';

/**
 * Render the hero title, wrapping a leading "No Bad" in an accent span. The span
 * only turns red when data-hero-title-accent is on (set by the page-style editor);
 * otherwise it inherits the title color, so the title reads as one color.
 */
function renderHeroTitle(title: string) {
  const m = /^no bad\b/i.exec(title);
  if (!m) return title;
  return (
    <>
      <span className="ev-title-accent">{title.slice(0, m[0].length)}</span>
      {title.slice(m[0].length)}
    </>
  );
}

export function TemplateEditorial({ event }: { event: EventDetailDTO }) {
  const applyHref = useMemberApplyHref();
  const start = parseDate(event.startAt);
  const dateCaps = formatDateLine(start);
  const venueCaps = event.location ? event.location.toUpperCase() : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--ev-ground)] text-[var(--ev-ink)]">
      {/* Hero — full-bleed photograph, or the deep-red NoBC mark panel */}
      <section
        className="relative isolate w-full"
        aria-label="Event hero"
        style={{ height: 'var(--hero-height-vh, 58vh)', minHeight: 380 }}
      >
        {event.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.heroImageUrl}
            alt=""
            className={`absolute inset-0 h-full w-full ${event.pageStyle.heroFit === 'contain' ? 'object-contain object-center' : 'object-cover'}`}
          />
        ) : (
          <EventHeroFallback className="absolute inset-0 h-full w-full" />
        )}

        {/* Legibility scrims — keep the red logo/nav (top) and title/date (bottom)
            readable over ANY hero photo. Opacities are CSS variables so the
            operator page-style editor can tune them per event; the defaults work
            for a typical photo. Black gradients are functional scrims, not brand
            colors, so they are exempt from the semantic-token rule. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-40"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,max(0.3, var(--hero-scrim-top,0.55))), rgba(0,0,0,0))' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-1/2"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,max(0.45, var(--hero-scrim-bottom,0.65))), rgba(0,0,0,0))' }}
        />

        <div className="absolute inset-x-0 top-0 z-10">
          <MemberShellNav applyHref={applyHref} theme="overlay" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-10 sm:px-10 sm:pb-14">
          <div className="ev-stagger mx-auto max-w-6xl">
            <h1
              className="max-w-4xl font-normal leading-[1.04] font-[family-name:var(--font-cormorant)]"
              style={{
                fontSize: 'calc(clamp(2.75rem, 5.8vw, 4.75rem) * var(--page-title-scale, 1))',
                color: 'var(--hero-title-fg, var(--hero-fg, white))',
              }}
            >
              {renderHeroTitle(event.title)}
            </h1>
            <p
              className="mt-4 text-[12px] font-medium uppercase tracking-[0.2em] font-[family-name:var(--font-dm-sans)]"
              style={{ color: 'var(--hero-fg-soft, rgba(255,255,255,0.85))' }}
            >
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
          <p className="max-w-2xl whitespace-pre-wrap text-[19px] leading-[1.8] text-[var(--ev-ink)] font-[family-name:var(--font-dm-sans)] lg:col-start-1 lg:row-start-1">
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
            <div className="mt-10 max-w-2xl border-t border-[var(--ev-rule)] pt-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--ev-muted)] font-[family-name:var(--font-dm-sans)]">
                Run of show
              </p>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-[var(--ev-ink)] font-[family-name:var(--font-dm-sans)]">
                {event.runOfShow}
              </pre>
            </div>
          ) : null}

          {(() => {
            const isTicketed = event.resolved.kind !== 'closed' && event.resolved.flow.includes('pay');
            return event.workflowPaths?.length && event.resolved.kind !== 'closed' && !isTicketed ? (
              <div className="mt-10 max-w-2xl">
                <WorkflowPathsCard paths={event.workflowPaths} />
              </div>
            ) : null;
          })()}

          {/* bottom brand anchor — hairline + muted wordmark + location; fills the
              lower panel intentionally on short-copy events (same as Split). */}
          <div className="mt-auto pt-20">
            <div className="h-px w-full bg-[var(--ev-rule)]" />
            <div className="flex items-end justify-between gap-6 pt-6">
              <div>
                <p
                  className="italic leading-none text-[var(--ev-muted)] font-[family-name:var(--font-cormorant)]"
                  style={{ fontSize: 'calc(clamp(1.5rem, 2.6vw, 2.25rem) * var(--footer-scale, 1))' }}
                >
                  No Bad Company
                </p>
                <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--ev-muted)] font-[family-name:var(--font-dm-sans)]">
                  {event.location ? `${event.location} · Austin` : 'Austin'}
                </p>
              </div>
              <a
                href="mailto:team@thenobadcompany.com"
                className="shrink-0 text-[13px] text-[var(--ev-muted)] underline-offset-4 transition-colors hover:text-[var(--ev-accent)] hover:underline font-[family-name:var(--font-dm-sans)]"
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
