'use client';

import { MemberShellFooter, MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';
import { RsvpCard } from './RsvpCard';
import type { EventDetailDTO } from './EventDetail';

function parseDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function formatDateLine(d: Date): string {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
    .format(d)
    .toUpperCase();
  const dayNum = d.getDate();
  const mon = new Intl.DateTimeFormat('en-GB', { month: 'short' })
    .format(d)
    .toUpperCase();
  const yr = d.getFullYear();
  return `${weekday} · ${dayNum} ${mon} · ${yr}`;
}

export function TemplateEditorial({ event }: { event: EventDetailDTO }) {
  const applyHref = useMemberApplyHref();
  const start = parseDate(event.startAt);
  const dateCaps = formatDateLine(start);
  const venueCaps = event.location ? event.location.toUpperCase() : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F7F2] text-[var(--apply-ink)]">
      {/* Hero */}
      <section
        className="relative isolate w-full"
        aria-label="Event hero"
        style={{ height: '40vh', minHeight: 320 }}
      >
        {event.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="events-ref-ph absolute inset-0" aria-hidden />
        )}
        {/* Scrim bottom 40% */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-2/5"
          style={{
            background:
              'linear-gradient(to top, rgba(28,16,8,0.78), rgba(28,16,8,0.0))',
          }}
        />
        <div className="absolute inset-x-0 top-0 z-10">
          <MemberShellNav applyHref={applyHref} theme="dark" />
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-10 sm:px-10 sm:pb-14">
          <div className="mx-auto max-w-6xl">
            <h1 className="max-w-4xl text-[clamp(2.5rem,5.5vw,4.5rem)] italic leading-[1.05] font-normal text-white" style={{ fontFamily: "'PP Editorial New', Georgia, serif" }}>
              {event.title}
            </h1>
            <p className="mt-4 text-[12px] font-normal uppercase tracking-[0.18em] text-white/85">
              {dateCaps}
              {venueCaps ? ` · ${venueCaps}` : ''}
            </p>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20 pt-12 sm:px-10 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
          <div>
            {event.description ? (
              <p className="whitespace-pre-wrap text-[20px] leading-[1.8] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
                {event.description}
              </p>
            ) : null}

            {event.runOfShow ? (
              <div className="mt-10 border-t border-[var(--apply-rule)] pt-8">
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                  Run of show
                </p>
                <pre className="mt-3 whitespace-pre-wrap text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                  {event.runOfShow}
                </pre>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-8 lg:self-start lg:max-w-sm">
            <RsvpCard event={event} />
          </aside>
        </div>
      </div>

      <MemberShellFooter applyHref={applyHref} />
    </div>
  );
}
