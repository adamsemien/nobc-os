'use client';

import { useState, useMemo } from 'react';
import { EmptyState } from '../../../_components/EmptyState';

type RsvpRow = {
  id: string;
  ticketStatus: string;
  origin: string;
  checkedIn: boolean;
  createdAt: string;
  stripePaymentIntentId: string | null;
  refundAmountCents: number | null;
  refundedAt: string | null;
  member: { firstName: string; lastName: string; email: string };
  plusOneOfMemberId: string | null;
};

type Props = {
  rsvps: RsvpRow[];
  eventId: string;
  priceInCents: number | null;
};

function getType(rsvp: RsvpRow): string {
  if (rsvp.origin === 'plus_one') return 'Plus One';
  if (rsvp.stripePaymentIntentId) return 'Ticket';
  return 'Member';
}

function getAmountPaid(rsvp: RsvpRow, priceInCents: number | null): string {
  if (!rsvp.stripePaymentIntentId) return '$0';
  if (rsvp.refundedAt) return '$0 (refunded)';
  return `$${((priceInCents ?? 0) / 100).toFixed(2)}`;
}

export function EventAttendeesTab({ rsvps, eventId: _eventId, priceInCents }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rsvps;
    return rsvps.filter(r => {
      const name = `${r.member.firstName} ${r.member.lastName}`.toLowerCase();
      return name.includes(q) || r.member.email.toLowerCase().includes(q);
    });
  }, [rsvps, search]);

  const totalRevenue = rsvps.reduce((sum, r) => {
    if (r.stripePaymentIntentId && !r.refundedAt) return sum + (priceInCents ?? 0);
    return sum;
  }, 0);

  function handleExport() {
    const csvRows = [
      ['Name', 'Email', 'Type', 'Amount Paid', 'Checked In'],
      ...filtered.map(r => [
        `${r.member.firstName} ${r.member.lastName}`,
        r.member.email,
        getType(r),
        getAmountPaid(r, priceInCents),
        r.checkedIn ? 'Yes' : 'No',
      ]),
    ];
    const csv = csvRows.map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendees.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{rsvps.length}</span> attendees
        </span>
        {totalRevenue > 0 && (
          <span className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">${(totalRevenue / 100).toFixed(2)}</span> revenue
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-muted"
            style={{ borderRadius: '6px' }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Search by name or email…"
        className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        style={{ borderRadius: '6px' }}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon="attendees"
          title="No one on the list yet."
          body="Share your event link to start collecting registrations."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border" style={{ borderRadius: '8px' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">Checked In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(rsvp => (
                <tr key={rsvp.id} className="bg-surface-elevated transition-colors hover:bg-muted">
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {rsvp.member.firstName} {rsvp.member.lastName}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{rsvp.member.email}</td>
                  <td className="px-4 py-3 text-text-secondary">{getType(rsvp)}</td>
                  <td className="px-4 py-3 text-text-secondary">{getAmountPaid(rsvp, priceInCents)}</td>
                  <td className="px-4 py-3">
                    {rsvp.checkedIn ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        Yes
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-text-muted">
                        No
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
