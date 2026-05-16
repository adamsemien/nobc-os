'use client';

import { useState, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Loader2, X } from 'lucide-react';
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

function getType(rsvp: RsvpRow): string {
  if (rsvp.isComp) return rsvp.compType ?? 'Comp';
  if (rsvp.origin === 'plus_one') return 'Plus One';
  if (rsvp.stripePaymentIntentId) return 'Ticket';
  return 'Member';
}

function getAmountPaid(rsvp: RsvpRow, priceInCents: number | null): string {
  if (rsvp.isComp) return 'Comp';
  if (!rsvp.stripePaymentIntentId) return '$0';
  if (rsvp.refundedAt) return '$0 (refunded)';
  return `$${((priceInCents ?? 0) / 100).toFixed(2)}`;
}

function isPending(rsvp: RsvpRow): boolean {
  return rsvp.ticketStatus === 'pending_approval' || rsvp.ticketStatus === 'held';
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-0.5 rounded-lg border border-border bg-surface-elevated px-4 py-3" style={{ minWidth: '120px', borderRadius: '8px' }}>
      <span className="text-[0.65rem] font-medium uppercase tracking-widest text-text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-text-primary">{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

export function EventAttendeesTab({ rsvps, eventId, priceInCents }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [compOpen, setCompOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rsvps;
    return rsvps.filter(r => {
      const name = `${r.member.firstName} ${r.member.lastName}`.toLowerCase();
      return name.includes(q) || r.member.email.toLowerCase().includes(q);
    });
  }, [rsvps, search]);

  const stats = useMemo(() => {
    const confirmed = rsvps.filter(r => r.ticketStatus === 'confirmed' && !r.isComp).length;
    const comps = rsvps.filter(r => r.isComp);
    const pending = rsvps.filter(isPending).length;
    const checkedIn = rsvps.filter(r => r.checkedIn).length;
    const byType = new Map<string, number>();
    for (const c of comps) {
      const t = c.compType ?? 'Other';
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    const compBreakdown = [...byType.entries()]
      .map(([t, n]) => `${n} ${t}`)
      .join(', ');
    return { confirmed, compCount: comps.length, compBreakdown, pending, checkedIn };
  }, [rsvps]);

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
            <span className="font-semibold text-text-primary">${(totalRevenue / 100).toFixed(2)}</span> revenue
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
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
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon="attendees"
          title="No one on the list yet."
          body="Share your event link to collect registrations, or issue a comp ticket."
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
                      <span className="text-text-secondary">{getType(rsvp)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{getAmountPaid(rsvp, priceInCents)}</td>
                  <td className="px-4 py-3">
                    {rsvp.checkedIn ? (
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium"
                        style={{ background: 'var(--success-soft)', color: 'var(--success)', borderRadius: '5px' }}
                      >
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

  const canSubmit =
    firstName.trim() && lastName.trim() && email.trim() && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
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
                onChange={e => setFirstName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Last name</span>
              <input
                className={fieldCls}
                value={lastName}
                onChange={e => setLastName(e.target.value)}
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
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Comp type</span>
            <select
              className={fieldCls}
              value={compType}
              onChange={e => setCompType(e.target.value as CompType)}
            >
              {COMP_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Internal note (optional)</span>
            <textarea
              className={`${fieldCls} resize-none`}
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Why this comp was issued — not shown to the recipient."
            />
          </label>

          {error && (
            <p
              className="rounded-md px-3 py-2 text-xs"
              style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: '6px' }}
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
