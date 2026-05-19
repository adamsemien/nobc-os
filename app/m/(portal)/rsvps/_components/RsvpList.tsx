'use client';

import { useState } from 'react';
import Link from 'next/link';

type RsvpRow = {
  id: string;
  ticketStatus: string;
  paymentStatus: string | null;
  isComp: boolean;
  createdAt: string;
  tierName: string | null;
  event: { id: string; title: string; startAt: string; location: string | null; slug: string };
};

type Props = { rsvps: RsvpRow[] };

function formatDate(iso: string): string {
  const d = new Date(iso);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d).toUpperCase();
  const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d).toUpperCase();
  const day = d.getDate();
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return `${weekday} · ${month} ${day} · ${time}`;
}

function TicketStatusBadge({ status }: { status: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (status) {
    case 'confirmed':
      bg = 'var(--success-soft)';
      color = 'var(--success)';
      label = 'Confirmed';
      break;
    case 'pending_approval':
      bg = 'var(--warning-soft)';
      color = 'var(--warning)';
      label = 'Pending';
      break;
    case 'waitlisted':
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = 'Waitlisted';
      break;
    case 'cancelled':
      bg = 'var(--danger-soft)';
      color = 'var(--danger)';
      label = 'Cancelled';
      break;
    default:
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = status;
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  let bg: string;
  let color: string;
  let label: string;

  switch (status) {
    case 'authorized':
      bg = 'var(--warning-soft)';
      color = 'var(--warning)';
      label = 'Auth Hold';
      break;
    case 'captured':
      bg = 'var(--success-soft)';
      color = 'var(--success)';
      label = 'Paid';
      break;
    case 'refunded':
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = 'Refunded';
      break;
    default:
      bg = 'var(--neutral-soft)';
      color = 'var(--events-fg-soft)';
      label = status;
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.12em]"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

export default function RsvpList({ rsvps }: Props) {
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<string[]>([]);

  async function handleCancel(rsvpId: string) {
    setCancelling(rsvpId);
    try {
      await fetch('/api/rsvp/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpId }),
      });
      setCancelled((prev) => [...prev, rsvpId]);
    } finally {
      setCancelling(null);
    }
  }

  const visible = rsvps.filter((r) => !cancelled.includes(r.id));

  if (visible.length === 0) {
    return (
      <div
        className="rounded-lg border p-10 text-center"
        style={{ borderColor: 'var(--events-line-soft)', background: 'var(--events-card)' }}
      >
        <p className="text-sm" style={{ color: 'var(--events-fg-quiet)' }}>
          No registrations yet.
        </p>
        <Link
          href="/m/events"
          className="mt-4 inline-block text-xs"
          style={{ color: 'var(--events-warm-accent)' }}
        >
          Browse upcoming events →
        </Link>
      </div>
    );
  }

  return (
    <div>
      {visible.map((rsvp) => {
        const isFuture = new Date(rsvp.event.startAt) > new Date();
        const canCancel = rsvp.ticketStatus === 'confirmed' && isFuture;
        const isCancelling = cancelling === rsvp.id;
        const showPayment =
          rsvp.paymentStatus &&
          rsvp.paymentStatus !== 'FREE' &&
          rsvp.paymentStatus !== null;

        return (
          <div
            key={rsvp.id}
            className="rounded-lg border p-5 mb-3"
            style={{ borderColor: 'var(--events-line-soft)', background: 'var(--events-card)' }}
          >
            {/* Top row */}
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/m/events/${rsvp.event.slug}`}
                className="text-lg font-normal hover:opacity-70 transition-opacity"
                style={{
                  color: 'var(--events-fg)',
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                }}
              >
                {rsvp.event.title}
              </Link>
              <TicketStatusBadge status={rsvp.ticketStatus} />
            </div>

            {/* Date + location */}
            <p
              className="text-[0.6rem] uppercase tracking-[0.18em] mt-2"
              style={{ color: 'var(--events-fg-soft)' }}
            >
              {formatDate(rsvp.event.startAt)}
              {rsvp.event.location && (
                <span className="normal-case ml-2" style={{ color: 'var(--events-fg-quiet)' }}>
                  · {rsvp.event.location}
                </span>
              )}
            </p>

            {/* Tier / payment */}
            {(rsvp.tierName || showPayment) && (
              <div className="flex items-center gap-2 mt-2">
                {rsvp.tierName && (
                  <span className="text-xs" style={{ color: 'var(--events-fg-quiet)' }}>
                    {rsvp.tierName}
                  </span>
                )}
                {showPayment && (
                  <PaymentStatusBadge status={rsvp.paymentStatus!} />
                )}
              </div>
            )}

            {/* Cancel */}
            {canCancel && (
              <div className="mt-3">
                <button
                  onClick={() => handleCancel(rsvp.id)}
                  disabled={isCancelling}
                  className="text-[0.6rem] uppercase tracking-[0.14em] transition-opacity hover:opacity-70 disabled:opacity-40"
                  style={{ color: 'var(--danger)' }}
                >
                  {isCancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
