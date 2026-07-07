'use client';

import { useState, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Loader2, X, DollarSign, AlertTriangle, ArrowUpCircle, UserX, Ban } from 'lucide-react';
import { EmptyState } from '../../../_components/EmptyState';
import { logQAAction } from '@/lib/dev/qa-action-log';

type RsvpRow = {
  id: string;
  ticketStatus: string;
  origin: string;
  checkedIn: boolean;
  createdAt: string;
  stripePaymentIntentId: string | null;
  paymentStatus: string | null;
  capturedAt: string | null;
  amountCents: number | null;
  refundAmountCents: number | null;
  refundedAt: string | null;
  isComp: boolean;
  compType: string | null;
  guestName: string | null;
  guestEmail: string | null;
  member: { firstName: string; lastName: string; email: string };
  plusOneOfMemberId: string | null;
};

type Props = {
  rsvps: RsvpRow[];
  eventId: string;
  priceInCents: number | null;
};

const COMP_TYPES = ['Sponsor', 'Vendor', 'Staff', 'Press', 'Partner', 'Other'] as const;
type CompType = (typeof COMP_TYPES)[number];

function getAttendeeType(rsvp: RsvpRow): string {
  if (rsvp.isComp) return rsvp.compType ?? 'Comp';
  if (rsvp.origin === 'plus_one') return 'Plus One';
  if (rsvp.stripePaymentIntentId) return 'Ticket';
  return 'Member';
}

function isPending(rsvp: RsvpRow): boolean {
  return rsvp.ticketStatus === 'pending_approval' || rsvp.ticketStatus === 'held';
}

function TicketStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    confirmed: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Confirmed' },
    pending_approval: { bg: 'var(--warning-soft)', color: 'var(--warning)', label: 'Pending' },
    // 'held' is a paid authorize-hold, NOT a waitlist entry — labeling it
    // "Waitlisted" made operators reach for Approve (which 409s on held).
    // The valid action for a held row is Capture.
    held: { bg: 'var(--muted)', color: 'var(--text-secondary)', label: 'Hold' },
    rejected: { bg: 'var(--danger-soft)', color: 'var(--danger)', label: 'Rejected' },
    refunded: { bg: 'var(--muted)', color: 'var(--text-muted)', label: 'Refunded' },
    cancelled: { bg: 'var(--muted)', color: 'var(--text-muted)', label: 'Cancelled' },
  };
  const style = map[status] ?? { bg: 'var(--muted)', color: 'var(--text-muted)', label: status };
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-medium"
      style={{ background: style.bg, color: style.color, borderRadius: '5px' }}
    >
      {style.label}
    </span>
  );
}

function PaymentBadge({ status }: { status: string | null }) {
  if (!status || status === 'FREE') {
    return (
      <span
        className="rounded px-2 py-0.5 text-xs font-medium"
        style={{ background: 'var(--muted)', color: 'var(--text-muted)', borderRadius: '5px' }}
      >
        Free
      </span>
    );
  }
  const map: Record<string, { bg: string; color: string; label: string }> = {
    AUTHORIZED: { bg: 'var(--accent-soft)', color: 'var(--accent)', label: 'Authorized' },
    CAPTURED: { bg: 'var(--success-soft)', color: 'var(--success)', label: 'Captured' },
    REFUNDED: { bg: 'var(--muted)', color: 'var(--text-muted)', label: 'Refunded' },
    FAILED: { bg: 'var(--danger-soft)', color: 'var(--danger)', label: 'Failed' },
  };
  const style = map[status] ?? { bg: 'var(--muted)', color: 'var(--text-muted)', label: status };
  return (
    <span
      className="rounded px-2 py-0.5 text-xs font-medium"
      style={{ background: style.bg, color: style.color, borderRadius: '5px' }}
    >
      {style.label}
    </span>
  );
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="flex flex-1 flex-col gap-0.5 rounded-lg border border-border bg-surface-elevated px-4 py-3"
      style={{ minWidth: '120px', borderRadius: '8px' }}
    >
      <span className="text-[0.65rem] font-medium uppercase tracking-widest text-text-muted">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-text-primary">{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

export function EventAttendeesTab({ rsvps, eventId, priceInCents }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [compOpen, setCompOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<RsvpRow | null>(null);
  const [captureLoading, setCaptureLoading] = useState<Record<string, boolean>>({});
  const [bulkCaptureLoading, setBulkCaptureLoading] = useState(false);
  const [promoteLoading, setPromoteLoading] = useState<Record<string, boolean>>({});
  const [rejectLoading, setRejectLoading] = useState<Record<string, boolean>>({});
  const [cancelLoading, setCancelLoading] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rsvps;
    return rsvps.filter((r) => {
      const name = `${r.member.firstName} ${r.member.lastName}`.toLowerCase();
      return name.includes(q) || r.member.email.toLowerCase().includes(q);
    });
  }, [rsvps, search]);

  const stats = useMemo(() => {
    const confirmed = rsvps.filter((r) => r.ticketStatus === 'confirmed' && !r.isComp).length;
    const comps = rsvps.filter((r) => r.isComp);
    const pending = rsvps.filter(isPending).length;
    const checkedIn = rsvps.filter((r) => r.checkedIn).length;
    const byType = new Map<string, number>();
    for (const c of comps) {
      const t = c.compType ?? 'Other';
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    const compBreakdown = [...byType.entries()].map(([t, n]) => `${n} ${t}`).join(', ');
    return { confirmed, compCount: comps.length, compBreakdown, pending, checkedIn };
  }, [rsvps]);

  const authorizedRsvps = useMemo(
    () => rsvps.filter((r) => r.paymentStatus === 'AUTHORIZED' && !r.capturedAt),
    [rsvps],
  );

  const totalRevenue = rsvps.reduce((sum, r) => {
    if (r.paymentStatus === 'CAPTURED' && r.amountCents) return sum + r.amountCents;
    if (r.stripePaymentIntentId && !r.refundedAt && !r.amountCents)
      return sum + (priceInCents ?? 0);
    return sum;
  }, 0);

  async function handleCapture(rsvpId: string) {
    setCaptureLoading((p) => ({ ...p, [rsvpId]: true }));
    try {
      const res = await fetch('/api/stripe/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? 'Capture failed');
      } else {
        router.refresh();
      }
    } finally {
      setCaptureLoading((p) => ({ ...p, [rsvpId]: false }));
    }
  }

  async function handleBulkCapture() {
    if (authorizedRsvps.length === 0) return;
    setBulkCaptureLoading(true);
    try {
      await Promise.all(
        authorizedRsvps.map((r) =>
          fetch('/api/stripe/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rsvpId: r.id }),
          }),
        ),
      );
      router.refresh();
    } finally {
      setBulkCaptureLoading(false);
    }
  }

  async function handlePromote(rsvpId: string) {
    setPromoteLoading((p) => ({ ...p, [rsvpId]: true }));
    try {
      const res = await fetch(`/api/operator/rsvps/${rsvpId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? 'Promote failed');
      } else {
        logQAAction('approved RSVP');
        router.refresh();
      }
    } finally {
      setPromoteLoading((p) => ({ ...p, [rsvpId]: false }));
    }
  }

  async function handleReject(rsvpId: string) {
    setRejectLoading((p) => ({ ...p, [rsvpId]: true }));
    try {
      const res = await fetch(`/api/operator/rsvps/${rsvpId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? 'Reject failed');
      } else {
        logQAAction('rejected RSVP');
        router.refresh();
      }
    } finally {
      setRejectLoading((p) => ({ ...p, [rsvpId]: false }));
    }
  }

  async function handleCancel(rsvpId: string) {
    setCancelLoading((p) => ({ ...p, [rsvpId]: true }));
    try {
      const res = await fetch(`/api/operator/rsvps/${rsvpId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? 'Cancel failed');
      } else {
        logQAAction('cancelled RSVP');
        router.refresh();
      }
    } finally {
      setCancelLoading((p) => ({ ...p, [rsvpId]: false }));
    }
  }

  function handleExport() {
    const csvRows = [
      ['Name', 'Email', 'Type', 'Payment', 'Amount', 'Checked In'],
      ...filtered.map((r) => [
        `${r.member.firstName} ${r.member.lastName}`,
        r.member.email,
        getAttendeeType(r),
        r.paymentStatus ?? 'FREE',
        r.amountCents ? formatCents(r.amountCents) : r.isComp ? 'Comp' : '$0',
        r.checkedIn ? 'Yes' : 'No',
      ]),
    ];
    const csv = csvRows.map((row) => row.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendees.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Confirmed" value={String(stats.confirmed)} sub="paid + member" />
        <StatCard
          label="Comps"
          value={String(stats.compCount)}
          sub={stats.compBreakdown || 'none issued'}
        />
        <StatCard label="Pending" value={String(stats.pending)} sub="awaiting approval" />
        <StatCard label="Checked In" value={String(stats.checkedIn)} sub={`of ${rsvps.length}`} />
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{rsvps.length}</span> total
        </span>
        {totalRevenue > 0 && (
          <span className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{formatCents(totalRevenue)}</span>{' '}
            revenue
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {authorizedRsvps.length > 0 && (
            <button
              type="button"
              onClick={handleBulkCapture}
              disabled={bulkCaptureLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-muted disabled:opacity-50"
              style={{ borderRadius: '6px' }}
            >
              {bulkCaptureLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DollarSign className="h-3.5 w-3.5" />
              )}
              Capture all ({authorizedRsvps.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setCompOpen(true)}
            className="btn-shimmer inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            style={{ borderRadius: '6px' }}
          >
            <Gift className="h-3.5 w-3.5" />
            Issue Comp
          </button>
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
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon="attendees"
          title="No one on the list yet."
          body="Share your event link to collect registrations, or issue a comp ticket."
        />
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-border"
          style={{ borderRadius: '8px' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Payment
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Checked In
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((rsvp) => {
                const isAuthorized =
                  rsvp.paymentStatus === 'AUTHORIZED' && !rsvp.capturedAt;
                const canRefund =
                  rsvp.stripePaymentIntentId &&
                  !rsvp.refundedAt &&
                  (rsvp.paymentStatus === 'AUTHORIZED' || rsvp.paymentStatus === 'CAPTURED');
                const displayAmount = rsvp.amountCents
                  ? formatCents(rsvp.amountCents)
                  : rsvp.isComp
                    ? 'Comp'
                    : rsvp.stripePaymentIntentId && priceInCents
                      ? formatCents(priceInCents)
                      : '$0';

                const rejectable = rsvp.ticketStatus === 'pending_approval';
                const canCancel =
                  rsvp.ticketStatus === 'confirmed' && !rsvp.stripePaymentIntentId;

                return (
                  <tr
                    key={rsvp.id}
                    className="bg-surface-elevated transition-colors hover:bg-muted"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {rsvp.member.firstName} {rsvp.member.lastName}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{rsvp.member.email}</td>
                    <td className="px-4 py-3">
                      {rsvp.isComp ? (
                        <span
                          className="rounded px-2 py-0.5 text-xs font-semibold"
                          style={{
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                            borderRadius: '5px',
                          }}
                        >
                          {rsvp.compType ?? 'Comp'}
                        </span>
                      ) : (
                        <span className="text-text-secondary">{getAttendeeType(rsvp)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TicketStatusBadge status={rsvp.ticketStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <PaymentBadge status={rsvp.stripePaymentIntentId ? rsvp.paymentStatus : 'FREE'} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{displayAmount}</td>
                    <td className="px-4 py-3">
                      {rsvp.checkedIn ? (
                        <span
                          className="rounded px-2 py-0.5 text-xs font-medium"
                          style={{
                            background: 'var(--success-soft)',
                            color: 'var(--success)',
                            borderRadius: '5px',
                          }}
                        >
                          Yes
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-text-muted">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {rsvp.ticketStatus === 'pending_approval' && (
                          <button
                            type="button"
                            disabled={promoteLoading[rsvp.id]}
                            onClick={() => handlePromote(rsvp.id)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
                            style={{
                              background: 'var(--accent-soft)',
                              color: 'var(--accent)',
                              borderRadius: '5px',
                            }}
                          >
                            {promoteLoading[rsvp.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ArrowUpCircle className="h-3 w-3" />
                            )}
                            Approve
                          </button>
                        )}
                        {rejectable && (
                          <button
                            type="button"
                            disabled={rejectLoading[rsvp.id]}
                            onClick={() => handleReject(rsvp.id)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
                            style={{
                              background: 'var(--danger-soft)',
                              color: 'var(--danger)',
                              borderRadius: '5px',
                            }}
                          >
                            {rejectLoading[rsvp.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <UserX className="h-3 w-3" />
                            )}
                            Reject
                          </button>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            disabled={cancelLoading[rsvp.id]}
                            onClick={() => handleCancel(rsvp.id)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
                            style={{
                              background: 'var(--muted)',
                              color: 'var(--text-muted)',
                              borderRadius: '5px',
                            }}
                          >
                            {cancelLoading[rsvp.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Ban className="h-3 w-3" />
                            )}
                            Cancel
                          </button>
                        )}
                        {isAuthorized && (
                          <button
                            type="button"
                            disabled={captureLoading[rsvp.id]}
                            onClick={() => handleCapture(rsvp.id)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
                            style={{
                              background: 'var(--success-soft)',
                              color: 'var(--success)',
                              borderRadius: '5px',
                            }}
                          >
                            {captureLoading[rsvp.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <DollarSign className="h-3 w-3" />
                            )}
                            Capture
                          </button>
                        )}
                        {canRefund && (
                          <button
                            type="button"
                            onClick={() => setRefundTarget(rsvp)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
                            style={{
                              background: 'var(--danger-soft)',
                              color: 'var(--danger)',
                              borderRadius: '5px',
                            }}
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {compOpen && (
        <CompDrawer
          eventId={eventId}
          onClose={() => setCompOpen(false)}
          onIssued={() => {
            setCompOpen(false);
            router.refresh();
          }}
        />
      )}

      {refundTarget && (
        <RefundModal
          rsvp={refundTarget}
          onClose={() => setRefundTarget(null)}
          onRefunded={() => {
            setRefundTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RefundModal({
  rsvp,
  onClose,
  onRefunded,
}: {
  rsvp: RsvpRow;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAuthorized = rsvp.paymentStatus === 'AUTHORIZED' && !rsvp.capturedAt;
  const name = `${rsvp.member.firstName} ${rsvp.member.lastName}`;

  // Remaining refundable balance = charged minus anything already refunded.
  const remainingCents = (rsvp.amountCents ?? 0) - (rsvp.refundAmountCents ?? 0);
  // Partial refunds only apply to a captured payment, never an uncaptured hold.
  const canPartialRefund = !isAuthorized && remainingCents > 0;
  const [amountDollars, setAmountDollars] = useState<string>(
    remainingCents > 0 ? (remainingCents / 100).toFixed(2) : '',
  );

  async function handleConfirm() {
    setError(null);

    // Resolve the partial amount (if the operator lowered it below the full balance).
    let amountCents: number | undefined;
    if (canPartialRefund) {
      const parsed = Math.round(parseFloat(amountDollars) * 100);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a valid refund amount.');
        return;
      }
      if (parsed > remainingCents) {
        setError(`Refund cannot exceed ${formatCents(remainingCents)}.`);
        return;
      }
      // Only send amountCents when it is genuinely a partial refund.
      if (parsed < remainingCents) amountCents = parsed;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/stripe/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpId: rsvp.id, ...(amountCents != null ? { amountCents } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Refund failed');
      onRefunded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--text-primary) 32%, transparent)' }}
      />
      <div
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
        role="dialog"
        aria-label="Confirm refund"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1 text-text-muted hover:text-text-primary"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--danger-soft)' }}
          >
            <AlertTriangle className="h-4 w-4" style={{ color: 'var(--danger)' }} />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">
              {isAuthorized ? 'Cancel authorization' : 'Refund payment'}
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              {isAuthorized
                ? `This will cancel the authorization hold for ${name}. Their card will not be charged.`
                : canPartialRefund
                  ? `Refund up to ${formatCents(remainingCents)} to ${name}.${
                      (rsvp.refundAmountCents ?? 0) > 0
                        ? ` ${formatCents(rsvp.refundAmountCents ?? 0)} has already been refunded.`
                        : ''
                    }`
                  : `This will refund ${rsvp.amountCents ? formatCents(rsvp.amountCents) : 'the full amount'} to ${name}.`}
            </p>
          </div>
        </div>

        {canPartialRefund && (
          <div className="mt-4">
            <label htmlFor="refund-amount" className="block text-xs font-medium text-text-secondary">
              Refund amount
            </label>
            <input
              id="refund-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              max={(remainingCents / 100).toFixed(2)}
              step="0.01"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              style={{ borderRadius: '6px' }}
            />
            <p className="mt-1 text-xs text-text-muted">
              Defaults to the full balance. Lower it to issue a partial refund.
            </p>
          </div>
        )}

        {error && (
          <p
            className="mt-3 rounded-md px-3 py-2 text-xs"
            style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: '6px' }}
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-muted"
            style={{ borderRadius: '6px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={{
              background: 'var(--danger)',
              borderRadius: '6px',
            }}
          >
            {loading ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : isAuthorized ? (
              'Cancel authorization'
            ) : (
              'Issue refund'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompDrawer({
  eventId,
  onClose,
  onIssued,
}: {
  eventId: string;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [compType, setCompType] = useState<CompType>('Sponsor');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const COMP_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const emailValid = COMP_EMAIL_RE.test(email.trim());
  const canSubmit =
    firstName.trim() && lastName.trim() && email.trim() && emailValid && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      if (email.trim() && !emailValid) setEmailError('Enter a valid email');
      return;
    }
    setSubmitting(true);
    setError(null);
    setEmailError(null);
    try {
      const res = await fetch(`/api/operator/events/${eventId}/comp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ firstName, lastName, email, compType, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      logQAAction('issued comp ticket');
      onIssued();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  const fieldCls =
    'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'color-mix(in srgb, var(--text-primary) 32%, transparent)' }}
      />
      <div
        className="anim-drawer-in relative flex h-full w-full max-w-[400px] flex-col overflow-y-auto border-l border-border bg-card shadow-xl"
        role="dialog"
        aria-label="Issue comp ticket"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text-primary font-[family-name:var(--font-dm-sans)]">
            Issue Comp Ticket
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn rounded-md p-1 text-text-muted hover:text-text-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 px-5 py-5">
          <p className="text-xs text-text-muted">
            Creates a confirmed registration at no charge and emails a QR ticket to the recipient.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-secondary">First name</span>
              <input
                className={fieldCls}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Last name</span>
              <input
                className={fieldCls}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Email</span>
            <input
              type="email"
              className={fieldCls}
              value={email}
              maxLength={254}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              onBlur={() =>
                setEmailError(
                  email.trim() && !COMP_EMAIL_RE.test(email.trim())
                    ? 'Enter a valid email'
                    : null,
                )
              }
              required
            />
            {emailError && (
              <span role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
                {emailError}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Comp type</span>
            <select
              className={fieldCls}
              value={compType}
              onChange={(e) => setCompType(e.target.value as CompType)}
            >
              {COMP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              Internal note (optional)
            </span>
            <textarea
              className={`${fieldCls} resize-none`}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this comp was issued — not shown to the recipient."
            />
          </label>

          {error && (
            <p
              className="rounded-md px-3 py-2 text-xs"
              style={{
                background: 'var(--danger-soft)',
                color: 'var(--danger)',
                borderRadius: '6px',
              }}
            >
              {error}
            </p>
          )}

          <div className="mt-auto flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-muted"
              style={{ borderRadius: '6px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-shimmer inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              style={{ borderRadius: '6px' }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Issue Comp
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
