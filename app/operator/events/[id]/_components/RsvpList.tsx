'use client';

import { useState } from 'react';

type RsvpRow = {
  id: string;
  ticketStatus: string;
  origin: string;
  stripePaymentIntentId: string | null;
  refundedAt: string | null;
  refundAmountCents: number | null;
  checkedIn: boolean;
  createdAt: string;
  member: { firstName: string; lastName: string; email: string };
};

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    confirmed: 'Confirmed',
    held: 'Held',
    pending_approval: 'Pending',
    payment_failed: 'Failed',
    refunded: 'Refunded',
    cancelled: 'Cancelled',
  };
  return map[status] ?? status;
}

function statusCls(status: string): string {
  if (status === 'confirmed') return 'bg-emerald-100 text-emerald-900';
  if (status === 'held') return 'bg-amber-50 text-amber-800';
  if (status === 'refunded') return 'bg-blue-50 text-blue-800';
  if (status === 'payment_failed') return 'bg-red-50 text-red-700';
  return 'bg-muted text-text-muted';
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function RsvpList({ eventId, initialRsvps }: { eventId: string; initialRsvps: RsvpRow[] }) {
  const [rsvps, setRsvps] = useState(initialRsvps);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRefund(rsvpId: string) {
    if (!confirm('Issue a full refund for this RSVP?')) return;
    setRefunding(rsvpId);
    setError(null);
    try {
      // Phase C: one refund machine - the ADMIN route with cumulative
      // idempotency + refund-revokes-proof (the old per-RSVP route is gone).
      const res = await fetch('/api/stripe/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; refundAmountCents?: number };
      if (!res.ok) throw new Error(data.error ?? 'Refund failed');
      setRsvps(prev =>
        prev.map(r =>
          r.id === rsvpId
            ? { ...r, ticketStatus: 'refunded', refundedAt: new Date().toISOString(), refundAmountCents: data.refundAmountCents ?? null }
            : r,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed');
    } finally {
      setRefunding(null);
    }
  }

  if (rsvps.length === 0) {
    return <p className="text-sm text-text-secondary py-4">No RSVPs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Guest</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Status</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Check-in</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rsvps.map(rsvp => (
              <tr key={rsvp.id} className="bg-surface-elevated">
                <td className="px-3 py-3">
                  <p className="font-medium text-text-primary">
                    {rsvp.member.firstName} {rsvp.member.lastName}
                    {rsvp.origin === 'plus_one' ? (
                      <span className="ml-2 text-[0.65rem] font-normal text-text-muted">+1</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-text-muted">{rsvp.member.email}</p>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusCls(rsvp.ticketStatus)}`}>
                    {statusLabel(rsvp.ticketStatus)}
                  </span>
                  {rsvp.refundedAt && rsvp.refundAmountCents ? (
                    <p className="mt-1 text-[0.65rem] text-text-muted">{formatCents(rsvp.refundAmountCents)}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-text-secondary">
                  {rsvp.checkedIn ? (
                    <span className="text-emerald-700 font-medium">✓ In</span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {rsvp.stripePaymentIntentId &&
                    rsvp.ticketStatus !== 'refunded' &&
                    rsvp.ticketStatus !== 'payment_failed' &&
                    rsvp.ticketStatus !== 'cancelled' ? (
                      <button
                        type="button"
                        onClick={() => void handleRefund(rsvp.id)}
                        disabled={refunding === rsvp.id}
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                      >
                        {refunding === rsvp.id ? 'Refunding…' : 'Refund'}
                      </button>
                    ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
