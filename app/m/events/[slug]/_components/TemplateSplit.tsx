'use client';

import { MemberShellFooter, MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';
import { RsvpCard } from './RsvpCard';
import { WorkflowPathsCard } from './WorkflowPathsCard';
import type { EventDetailDTO } from './EventDetail';
import { accessTypeLabel } from '@/lib/event-access';

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
  return `${weekday} · ${dayNum} ${mon}`;
}

function formatTimeLine(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function TemplateSplit({ event }: { event: EventDetailDTO }) {
  const applyHref = useMemberApplyHref();
  const start = parseDate(event.startAt);

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F7F2] text-[var(--apply-ink)] lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Left: image (or solid red w/ pattern) */}
      <div className="relative lg:h-screen lg:w-1/2 lg:shrink-0 lg:overflow-hidden">
        {event.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.heroImageUrl}
            alt=""
            className="h-[45vh] w-full object-cover lg:h-full"
          />
        ) : (
          <div
            aria-hidden
            className="h-[45vh] w-full lg:h-full"
            style={{
              backgroundColor: 'var(--nobc-red)',
              backgroundImage:
                'repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 14px)',
            }}
          />
        )}
      </div>

      {/* Right: content */}
      <div className="flex flex-1 flex-col lg:h-screen lg:w-1/2 lg:overflow-y-auto">
        <MemberShellNav applyHref={applyHref} />

        <div className="flex flex-1 flex-col px-6 pb-16 pt-6 sm:px-10 sm:pt-10">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            {accessTypeLabel(event.resolved)}
          </p>

          <h1 className="mt-4 max-w-2xl text-[clamp(2.25rem,4.2vw,3.5rem)] leading-[1.05] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            {event.title}
          </h1>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="rounded-sm border border-[var(--apply-rule)] px-3 py-1 text-[11px] uppercase tracking-widest text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              {formatDateLine(start)}
            </span>
            <span className="rounded-sm border border-[var(--apply-rule)] px-3 py-1 text-[11px] uppercase tracking-widest text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              {formatTimeLine(start)}
            </span>
            {event.location ? (
              <span className="rounded-sm border border-[var(--apply-rule)] px-3 py-1 text-[11px] uppercase tracking-widest text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
                {event.location}
              </span>
            ) : null}
          </div>

          <div className="my-8 h-px w-full bg-[var(--apply-rule)]" />

          {event.description ? (
            <p className="max-w-2xl whitespace-pre-wrap text-[16px] leading-[1.75] text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
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

          <div className="mt-auto">
            <MemberShellFooter applyHref={applyHref} />
          </div>
        </div>
      </div>
    </div>
  );
}
