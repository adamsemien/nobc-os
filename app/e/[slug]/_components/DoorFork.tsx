'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

/**
 * DoorFork — the two-choice guest entry point for the public event page.
 *
 * Additive and presentational ONLY. It renders in the access-card slot of the
 * event template (TemplateSplit) for the active event's public view:
 *   • Choice A "Become a member" -> /apply (Door 1, plain link, no pre-gate).
 *   • Choice B "Join us for the night" -> reveals the access card passed as
 *     children (RsvpCard), whose own CTA drives the existing buy flow.
 *
 * Touches nothing in the gate engine, the builder, EventAccessFlow, or Door 1.
 */
const buttonClass =
  'block w-full rounded-sm bg-[var(--nobc-red)] px-6 py-4 text-center text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--nobc-on-red)] transition-colors hover:bg-[var(--nobc-red-hover)] font-[family-name:var(--font-dm-sans)]';

const subcopyClass =
  'text-[13px] leading-relaxed text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]';

export function DoorFork({ children }: { children: ReactNode }) {
  const [showBuy, setShowBuy] = useState(false);

  if (showBuy) return <>{children}</>;

  return (
    <div className="flex w-full flex-col gap-6">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Choose how to join us
      </p>

      <div className="flex w-full flex-col gap-2">
        <Link href="/apply" className={buttonClass}>
          Become a member
        </Link>
        <p className={subcopyClass}>We read every application. Nothing goes unnoticed.</p>
      </div>

      <div className="flex w-full flex-col gap-2">
        <button type="button" onClick={() => setShowBuy(true)} className={buttonClass}>
          Join us for the night - $17
        </button>
        <p className={subcopyClass}>Answer a few quick questions and grab your ticket.</p>
      </div>
    </div>
  );
}
