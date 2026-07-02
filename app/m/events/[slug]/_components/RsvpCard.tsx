'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';

import { UserPlus, X } from 'lucide-react';

import type { EventDetailDTO } from './EventDetail';
import { EventAccessFlow } from './EventAccessFlow';
import { useMemberApplyHref } from '../../_components/MemberShell';
import { warmClosedCopy } from './event-format';
import { formatGateCTA, accessTypeLabel } from '@/lib/event-access';

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
    return <div className="h-[200px] w-[200px] animate-pulse rounded-sm bg-events-paper" />;
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
  /** Hide the access-type label + capacity meter + top divider (when the page
   *  already shows them, e.g. the Split template). */
  hideHeader?: boolean;
  /** On mobile, hide the inline card in the CTA state and pin the CTA to the
   *  bottom of the viewport instead. Shares the same access flow. */
  mobileSticky?: boolean;
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
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
              Guest
            </p>
            <p className="mt-1 text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
              {addedGuest.guestName}
            </p>
            <p className="truncate text-xs text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
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

/** Refined capacity indicator — slim progress bar + remaining count. */
function CapacityMeter({ used, capacity }: { used: number; capacity: number }) {
  const remaining = Math.max(0, capacity - used);
  const pct = Math.min(100, Math.max(0, Math.round((used / capacity) * 100)));
  return (
    <div className="mt-4">
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--apply-rule)]">
        <div
          className="h-full rounded-full bg-[var(--nobc-red)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        {remaining > 0
          ? `${remaining} spot${remaining === 1 ? '' : 's'} remaining`
          : 'At capacity'}
      </p>
    </div>
  );
}

export function RsvpCard({ event, variant = 'card', hideHeader = false, mobileSticky = false }: Props) {
  const applyHref = useMemberApplyHref();
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
  // Portal the access flow to <body> so its fixed-position overlay escapes the
  // template column's .ev-stagger transform. That transform becomes the
  // containing block + stacking context and otherwise traps the modal beneath
  // later siblings (the page footer), making it unclickable. Mounted guard
  // keeps this SSR-safe (document.body is browser-only).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      ? 'rounded-md border border-[var(--apply-rule)] bg-events-paper-card p-6 shadow-[0_2px_12px_rgba(28,16,8,0.05)]'
      : 'p-0';

  const resolved = event.resolved;
  const isClosed = resolved.kind === 'closed';
  // Stage 17 (M4): an Access Gate on the event owns the public door - it
  // REPLACES the v1 access policy for every pre-engagement state (idle,
  // closed, full), because the gate's conditions are now the door decision.
  // The CTA posts to the mint route (no JS needed) and the v1 access flow is
  // never mounted. Only the public /e loader sets `gated` - /m is unchanged.
  const isGated = event.gated === true;
  const ctaLabel = isGated ? 'Unlock Access' : isClosed ? 'Closed' : formatGateCTA(resolved);
  const showCapacityMeter =
    !hideHeader &&
    event.showCapacity && event.capacity != null && rsvpState === 'idle' && !isClosed;
  // The only state with an actionable button — drives the mobile sticky CTA.
  const isCtaState = rsvpState === 'idle' && (isGated || (!isClosed && !isFull));

  return (
    <>
    <div className={`ev-access-card ${cardWrapper}${mobileSticky && isCtaState ? ' max-lg:hidden' : ''}`}>
      {!hideHeader ? (
        <>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            {isGated ? 'Event Access' : accessTypeLabel(event.resolved)}
          </p>

          {showCapacityMeter ? (
            <CapacityMeter used={event.capacityUsedCount} capacity={event.capacity!} />
          ) : null}

          <div className="my-5 h-px w-full bg-[var(--apply-rule)]" />
        </>
      ) : null}

      {rsvpState === 'confirmed' ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            You&rsquo;re on the list
          </p>
          <p className="mt-1.5 text-[22px] leading-snug text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            We&rsquo;ll see you there.
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
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            Request received
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            Your request is in — we&rsquo;ll be in touch shortly.
          </p>
        </div>
      ) : rsvpState === 'waitlisted' ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            On the waitlist
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
            {waitlistPosition ? `You're #${waitlistPosition}. ` : ''}
            We&rsquo;ll let you know the moment a spot opens.
          </p>
        </div>
      ) : isGated ? (
        <form method="post" action={`/e/${event.slug}/access`} className="space-y-3">
          <button
            type="submit"
            className="w-full rounded-md bg-[var(--nobc-red)] px-5 py-4 text-center text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--nobc-on-red)] transition-all hover:bg-[var(--nobc-red-hover)] hover:shadow-[0_4px_18px_rgba(178,46,33,0.28)] font-[family-name:var(--font-dm-sans)]"
          >
            {ctaLabel}
          </button>
          <p className="text-[10px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            A few steps unlock your access
          </p>
        </form>
      ) : resolved.kind === 'closed' ? (
        (() => {
          const c = warmClosedCopy(resolved);
          return (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                {c.eyebrow}
              </p>
              <p className="mt-2 text-[18px] leading-snug text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
                {c.body}
              </p>
              {c.showApply ? (
                <div className="mt-5">
                  {c.invite ? (
                    <p className="text-[13px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
                      {c.invite}
                    </p>
                  ) : null}
                  <Link
                    href={applyHref}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--apply-rule)] px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--apply-ink)] transition-colors hover:border-[var(--nobc-red)] hover:bg-[var(--nobc-red)] hover:text-[var(--nobc-on-red)] font-[family-name:var(--font-dm-sans)]"
                  >
                    Apply to attend →
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })()
      ) : isFull ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            At capacity
          </p>
          <p className="mt-2 text-[18px] leading-snug text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
            This gathering is full.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setFlowOpen(true)}
            className="w-full rounded-md bg-[var(--nobc-red)] px-5 py-4 text-center text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--nobc-on-red)] transition-all hover:bg-[var(--nobc-red-hover)] hover:shadow-[0_4px_18px_rgba(178,46,33,0.28)] font-[family-name:var(--font-dm-sans)]"
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

    </div>

      {mobileSticky && isCtaState ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--apply-rule)] bg-events-paper-card/95 px-5 py-4 backdrop-blur lg:hidden"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {isGated ? (
            <form method="post" action={`/e/${event.slug}/access`}>
              <button
                type="submit"
                className="w-full rounded-md bg-[var(--nobc-red)] px-5 py-4 text-center text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--nobc-on-red)] transition-all hover:bg-[var(--nobc-red-hover)] hover:shadow-[0_4px_18px_rgba(178,46,33,0.28)] font-[family-name:var(--font-dm-sans)]"
              >
                {ctaLabel}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setFlowOpen(true)}
              className="w-full rounded-md bg-[var(--nobc-red)] px-5 py-4 text-center text-[12px] font-medium uppercase tracking-[0.18em] text-[var(--nobc-on-red)] transition-all hover:bg-[var(--nobc-red-hover)] hover:shadow-[0_4px_18px_rgba(178,46,33,0.28)] font-[family-name:var(--font-dm-sans)]"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      ) : null}

      {mounted && !isGated
        ? createPortal(
            <EventAccessFlow
              event={event}
              open={flowOpen}
              onClose={() => setFlowOpen(false)}
              onComplete={handleFlowComplete}
            />,
            document.body,
          )
        : null}
    </>
  );
}
