'use client';

import { useEffect } from 'react';
import type { EventDetailDTO } from './EventDetail';
import { formatGateCTA } from '@/lib/event-access';

type Props = {
  event: EventDetailDTO;
  open: boolean;
  onClose: () => void;
  onComplete: (result: {
    ticketStatus?: string;
    memberQrCode?: string | null;
    waitlisted?: boolean;
    position?: number | null;
  }) => void;
};

/**
 * EventAccessFlow — multi-step modal flow engine.
 * Stub shell; real steps wired in Task 9-12 (auth, guestInfo, fields, pay, submit).
 */
export function EventAccessFlow({ event, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cta = event.resolved ? formatGateCTA(event.resolved) : 'Continue';
  const steps = event.steps ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Event access flow"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-[10px] bg-[#F9F7F2] p-6 shadow-[0_-2px_20px_rgba(0,0,0,0.15)] sm:rounded-[10px] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          {event.title}
        </p>
        <h2 className="mt-2 text-[28px] leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
          {cta}
        </h2>
        <p className="mt-4 text-sm text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          Flow steps: {steps.length > 0 ? steps.join(' → ') : 'none'}
        </p>
        <p className="mt-2 text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          Full step UI lands in the next pass.
        </p>
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-[var(--apply-rule)] px-4 py-2 text-[11px] uppercase tracking-widest text-[var(--apply-ink)] hover:border-[var(--nobc-red)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
