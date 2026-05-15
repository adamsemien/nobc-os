'use client';

import { useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

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
};

const CHECKIN_SECRET = process.env.NEXT_PUBLIC_CHECKIN_SECRET;

export function EventCheckinTab({ rsvps: initialRsvps, eventId: _eventId }: Props) {
  const [rsvps, setRsvps] = useState(initialRsvps);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const confirmed = useMemo(
    () => rsvps.filter(r => r.ticketStatus === 'confirmed' || r.ticketStatus === 'held'),
    [rsvps],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return confirmed;
    return confirmed.filter(r => {
      const name = `${r.member.firstName} ${r.member.lastName}`.toLowerCase();
      return name.includes(q) || r.member.email.toLowerCase().includes(q);
    });
  }, [confirmed, search]);

  const checkedInCount = confirmed.filter(r => r.checkedIn).length;

  if (!CHECKIN_SECRET) {
    return (
      <div className="rounded-lg border border-border bg-muted p-4 text-sm text-text-secondary">
        Check-in not configured — set <code className="font-mono">NEXT_PUBLIC_CHECKIN_SECRET</code>
      </div>
    );
  }

  async function handleCheckIn(rsvpId: string) {
    setPending(rsvpId);
    setErrors(prev => { const next = { ...prev }; delete next[rsvpId]; return next; });
    try {
      const res = await fetch(`/api/check-in/${rsvpId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CHECKIN_SECRET ?? ''}` },
      });
      if (!res.ok) throw new Error(`Check-in failed (${res.status})`);
      setRsvps(prev =>
        prev.map(r => (r.id === rsvpId ? { ...r, checkedIn: true } : r)),
      );
    } catch (e) {
      setErrors(prev => ({
        ...prev,
        [rsvpId]: e instanceof Error ? e.message : 'Failed',
      }));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Big stat */}
      <div className="rounded-lg border border-border bg-surface-elevated p-5 text-center" style={{ borderRadius: '8px' }}>
        <p className="text-4xl font-semibold text-text-primary">
          {checkedInCount} <span className="text-text-muted">/</span> {confirmed.length}
        </p>
        <p className="mt-1 text-sm text-text-muted">checked in</p>
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
        <p className="py-8 text-center text-sm text-text-secondary">No confirmed guests found.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden" style={{ borderRadius: '8px' }}>
          {filtered.map(rsvp => (
            <li
              key={rsvp.id}
              className="flex items-center gap-3 bg-surface-elevated px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text-primary">
                  {rsvp.member.firstName} {rsvp.member.lastName}
                </p>
                <p className="text-xs text-text-muted">{rsvp.member.email}</p>
                {errors[rsvp.id] && (
                  <p className="text-xs text-text-muted mt-0.5">{errors[rsvp.id]}</p>
                )}
              </div>
              {rsvp.checkedIn ? (
                <span className="rounded bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                  Checked In
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCheckIn(rsvp.id)}
                  disabled={pending === rsvp.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                  style={{ borderRadius: '6px' }}
                >
                  {pending === rsvp.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  Check In
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
