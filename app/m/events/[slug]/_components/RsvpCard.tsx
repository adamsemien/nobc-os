'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';

import { UserPlus, X } from 'lucide-react';

import type { EventDetailDTO } from './EventDetail';
import { EventAccessFlow } from './EventAccessFlow';
import { formatGateCTA } from '@/lib/event-access';

function QrDisplay({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(code, {
      type: 'svg',
      width: 200,
      margin: 1,
      color: { dark: '#1C1008', light: '#FFFFFF' },
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!svg) {
    return <div className="h-[200px] w-[200px] animate-pulse rounded-sm bg-[#F9F7F2]" />;
  }
  return (
    <div
      className="text-[var(--apply-ink)] [&_svg]:h-auto [&_svg]:max-w-[200px]"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

type Props = {
  event: EventDetailDTO;
  variant?: 'card' | 'borderless';
};

function PlusOneSection({
  eventId,
  existingPlusOne,
}: {
  eventId: string;
  existingPlusOne: EventDetailDTO['plusOneRsvp'];
}) {
  const [mode, setMode] = useState<'collapsed' | 'form' | 'done'>(
    existingPlusOne ? 'done' : 'collapsed',
  );
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedGuest, setAddedGuest] =
    useState<EventDetailDTO['plusOneRsvp']>(existingPlusOne);

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rsvp/plus-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setAddedGuest({
        id: '',
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
      });
      setMode('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!addedGuest?.id) return;
    setLoading(true);
    try {
      await fetch('/api/rsvp/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpId: addedGuest.id }),
      });
      setAddedGuest(null);
      setMode('collapsed');
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'done' && addedGuest) {
    return (
      <div className="mt-6 border-t border-[var(--apply-rule)] pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              Guest
            </p>
            <p className="mt-1 text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              {addedGuest.guestName}
            </p>
            <p className="text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              {addedGuest.guestEmail}
            </p>
          </div>
          {addedGuest.id ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={loading}
              className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[var(--apply-muted)] hover:text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
            >
              <X className="h-3 w-3" />
              Remove
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (mode === 'form') {
    return (
      <div className="mt-6 border-t border-[var(--apply-rule)] pt-6">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
          Bring a guest
        </p>
        <form onSubmit={handleAddGuest} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="guest-name"
              className="mb-1 block text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
            >
              Guest name
            </label>
            <input
              id="guest-name"
              type="text"
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full border-0 border-b border-[var(--apply-rule)] bg-transparent py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            />
          </div>
          <div>
            <label
              htmlFor="guest-email"
              className="mb-1 block text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
            >
              Guest email
            </label>
            <input
              id="guest-email"
              type="email"
              required
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="w-full border-0 border-b border-[var(--apply-rule)] bg-transparent py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-[var(--nobc-red)]">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMode('collapsed')}
              className="text-[11px] uppercase tracking-widest text-[var(--apply-muted)] underline-offset-4 hover:underline font-[family-name:var(--font-dm-sans)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-sm border border-[var(--apply-rule)] px-5 py-2.5 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:bg-[var(--nobc-red)] hover:text-[var(--nobc-on-red)] disabled:opacity-50 font-[family-name:var(--font-dm-sans)]"
            >
              {loading ? 'Adding…' : 'Add guest'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-[var(--apply-rule)] pt-6">
      <button
        type="button"
        onClick={() => setMode('form')}
        className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--apply-muted)] underline-offset-4 hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
      >
        <UserPlus className="h-3.5 w-3.5" aria-hidden />
        Bring a guest
      </button>
    </div>
  );
}

function getAccessBadgeLabel(event: EventDetailDTO): string {
  const r = event.resolved;
  if (r.kind === 'closed') return 'Closed';
  if (/pay/.test(r.gate as string)) return 'Ticketed';
  if (r.gate === 'apply' || /approval$/.test(r.gate as string)) return 'Apply to Attend';
  if (r.kind === 'member') return 'Members';
  return 'Open';
}

export function RsvpCard({ event, variant = 'card' }: Props) {
  const searchParams = useSearchParams();
  const successFromUrl = searchParams.get('rsvp') === 'success';

  const isFull =
    event.capacity != null && event.capacityUsedCount >= event.capacity;

  const initialState: 'idle' | 'confirmed' | 'pending_approval' = (() => {
    if (!event.existingRsvp) return 'idle';
    if (event.existingRsvp.ticketStatus === 'pending_approval')
      return 'pending_approval';
    if (event.existingRsvp.ticketStatus === 'held') return 'idle';
    return 'confirmed';
  })();

  const [rsvpState, setRsvpState] = useState<
    'idle' | 'confirmed' | 'pending_approval' | 'waitlisted'
  >(successFromUrl ? 'confirmed' : initialState);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(event.memberQrCode);
  const [flowOpen, setFlowOpen] = useState(false);

  function handleFlowComplete(result: {
    ticketStatus?: string;
    memberQrCode?: string | null;
    waitlisted?: boolean;
    position?: number | null;
  }) {
    setFlowOpen(false);
    if (result.waitlisted) {
      setWaitlistPosition(result.position ?? null);
      setRsvpState('waitlisted');
    } else if (result.ticketStatus === 'pending_approval') {
      setRsvpState('pending_approval');
    } else {
      if (result.memberQrCode) setQrCode(result.memberQrCode);
      setRsvpState('confirmed');
    }
  }

  const cardWrapper =
    variant === 'card'
      ? 'rounded-sm border border-[var(--apply-rule)] bg-[#FFFCF6] p-6 shadow-[0_1px_2px_rgba(28,16,8,0.04)]'
      : 'p-0';

  const remaining =
    event.showCapacity && event.capacity
      ? event.capacity - event.capacityUsedCount
      : null;

  const resolved = event.resolved;
  const isClosed = resolved.kind === 'closed';
  const gateUnsupported = !isClosed && !resolved.supported;
  const ctaLabel = isClosed ? 'Closed' : formatGateCTA(resolved);

  return (
    <div className={cardWrapper}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-block rounded-sm border border-[var(--apply-rule)] px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
          {getAccessBadgeLabel(event)}
        </span>
        {remaining != null && remaining > 0 ? (
          <span className="text-[11px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {remaining} spot{remaining === 1 ? '' : 's'} remaining
          </span>
        ) : null}
      </div>

      <div className="my-5 h-px w-full bg-[var(--apply-rule)]" />

      {rsvpState === 'confirmed' ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            ✓ You&rsquo;re on the list
          </p>
          <p className="mt-2 text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            {event.title}
          </p>
          {qrCode ? (
            <div className="mt-5 flex flex-col items-start gap-2">
              <QrDisplay code={qrCode} />
              <p className="text-[10px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                Show this at the door
              </p>
            </div>
          ) : null}
          {event.plusOnesAllowed ? (
            <PlusOneSection eventId={event.eventId} existingPlusOne={event.plusOneRsvp} />
          ) : null}
        </div>
      ) : rsvpState === 'pending_approval' ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Request received
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            The operator will review your request. You&rsquo;ll hear back shortly.
          </p>
        </div>
      ) : rsvpState === 'waitlisted' ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            On the waitlist
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            {waitlistPosition ? `You're #${waitlistPosition}. ` : ''}
            We&rsquo;ll notify you if a spot opens.
          </p>
        </div>
      ) : isClosed ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {resolved.reason}
          </p>
        </div>
      ) : isFull ? (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Sold Out
          </p>
        </div>
      ) : gateUnsupported ? (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Available in next update
          </p>
          <p className="text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            This event flow isn&rsquo;t live yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setFlowOpen(true)}
            className="w-full rounded-sm bg-[var(--nobc-red)] px-5 py-3 text-center text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] transition-colors hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] font-[family-name:var(--font-dm-sans)]"
          >
            {ctaLabel}
          </button>
          {resolved.kind === 'guest' && event.viewer !== 'guest' ? (
            <p className="text-[10px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              No member account required
            </p>
          ) : null}
        </div>
      )}

      <EventAccessFlow
        event={event}
        open={flowOpen}
        onClose={() => setFlowOpen(false)}
        onComplete={handleFlowComplete}
      />
    </div>
  );
}
