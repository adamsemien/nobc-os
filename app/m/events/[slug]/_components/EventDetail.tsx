'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, Clock, MapPin, UserPlus, X } from 'lucide-react';
import QRCode from 'qrcode';

import { MemberShellFooter, MemberShellNav, useMemberApplyHref } from '../../_components/MemberShell';

export type EventDetailDTO = {
  eventId: string;
  slug: string;
  title: string;
  description: string | null;
  startAt: string | Date;
  endAt?: string | Date | null;
  location: string | null;
  mapsUrl: string | null;
  runOfShow: string | null;
  accessMode: 'OPEN' | 'TICKETED' | 'APPLY_OR_PAY';
  applyMode: 'APPROVAL_HOLDS_TICKET' | 'SUBMIT_CONFIRMS_ENTRY' | null;
  approvalRequired: boolean;
  capacity: number | null;
  /** Confirmed + held (capacity). */
  capacityUsedCount: number;
  showCapacity: boolean;
  plusOnesAllowed: boolean;
  heroImageUrl: string | null;
  priceInCents?: number | null;
  nonMemberPriceCents?: number | null;
  memberApproved: boolean;
  memberId: string | null;
  memberQrCode: string | null;
  existingRsvp: { id: string; ticketStatus: string } | null;
  customQuestions: {
    id: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';
    label: string;
    required: boolean;
    options?: string[];
  }[];
  plusOneRsvp: { id: string; guestName: string; guestEmail: string } | null;
  applyHref: string;
};

function parseDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

function formatCapsDateLine(d: Date): string {
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d).toUpperCase();
  const dayNum = d.getDate();
  const mon = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d).toUpperCase();
  const yr = d.getFullYear();
  return `${weekday} · ${dayNum} ${mon} · ${yr}`;
}

function formatTimeLine(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function CapacityBadge({ used, max }: { used: number; max: number }) {
  const remaining = max - used;
  const pct = used / max;
  if (pct < 0.8) return null;
  return (
    <p className="text-center text-[0.65rem] font-medium uppercase tracking-[0.28em] text-events-fg-quiet sm:text-left">
      {remaining <= 0 ? 'Sold out' : `${remaining} spot${remaining === 1 ? '' : 's'} left`}
    </p>
  );
}

function QrDisplay({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const root = document.documentElement;
    const dark = getComputedStyle(root).getPropertyValue('--events-fg').trim() || 'oklch(0.93 0.018 82)';
    const light = getComputedStyle(root).getPropertyValue('--events-canvas-deep').trim() || 'oklch(0.17 0.01 45)';
    QRCode.toString(code, {
      type: 'svg',
      width: 200,
      margin: 1,
      color: { dark, light },
    })
      .then(s => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!svg) {
    return <div className="h-[200px] w-[200px] animate-pulse rounded bg-events-card" />;
  }

  return (
    <div
      className="text-events-fg [&_svg]:h-auto [&_svg]:max-w-[200px]"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function RsvpConfirmation({ event, qrCode }: { event: EventDetailDTO; qrCode: string | null }) {
  return (
    <div className="rounded border border-events-line-soft bg-events-card px-6 py-8">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.35em] text-events-warm-accent mb-3">
        You&rsquo;re in
      </p>
      <p className="text-sm font-normal leading-relaxed text-events-fg-soft mb-6">
        {event.title} · {formatCapsDateLine(parseDate(event.startAt))}
      </p>
      {qrCode ? (
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <QrDisplay code={qrCode} />
          <p className="text-[0.6rem] font-normal uppercase tracking-[0.2em] text-events-fg-quiet">
            Show this at the door
          </p>
        </div>
      ) : null}
    </div>
  );
}

type CustomAnswers = Record<string, string | boolean>;

function CustomQuestionsForm({
  questions,
  onSubmit,
  onBack,
  loading,
}: {
  questions: EventDetailDTO['customQuestions'];
  onSubmit: (answers: CustomAnswers) => void;
  onBack: () => void;
  loading: boolean;
}) {
  const [answers, setAnswers] = useState<CustomAnswers>(() =>
    Object.fromEntries(questions.map(q => [q.id, q.type === 'checkbox' ? false : ''])),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(answers);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.35em] text-events-warm-accent">
        A few questions
      </p>
      {questions.map(q => (
        <div key={q.id}>
          <label
            htmlFor={`cq-${q.id}`}
            className="block text-sm font-normal text-events-fg-soft mb-1"
          >
            {q.label}
            {q.required ? <span aria-hidden className="ml-1 text-events-warm-accent">*</span> : null}
          </label>
          {q.type === 'textarea' ? (
            <textarea
              id={`cq-${q.id}`}
              rows={3}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              className="w-full border-0 border-b border-events-line-soft bg-transparent py-2 text-sm text-events-fg placeholder:text-events-fg-quiet/50 focus:outline-none focus:border-events-warm-accent resize-none transition-colors"
            />
          ) : q.type === 'select' && q.options ? (
            <select
              id={`cq-${q.id}`}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              className="w-full border-0 border-b border-events-line-soft bg-transparent py-2 text-sm text-events-fg focus:outline-none focus:border-events-warm-accent transition-colors"
            >
              <option value="">Select…</option>
              {q.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : q.type === 'checkbox' ? (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id={`cq-${q.id}`}
                type="checkbox"
                required={q.required}
                checked={Boolean(answers[q.id])}
                onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.checked }))}
                className="h-4 w-4"
              />
              <span className="text-sm text-events-fg">{q.label}</span>
            </label>
          ) : (
            <input
              id={`cq-${q.id}`}
              type={q.type}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              className="w-full border-0 border-b border-events-line-soft bg-transparent py-2 text-sm text-events-fg placeholder:text-events-fg-quiet/50 focus:outline-none focus:border-events-warm-accent transition-colors"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-normal text-events-fg-soft underline-offset-4 hover:underline"
        >
          ← Back
        </button>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="border border-nobc-red bg-nobc-red px-8 py-4 text-[0.65rem] font-medium uppercase tracking-[0.24em] text-nobc-on-red transition-colors hover:border-nobc-red-hover hover:bg-nobc-red-hover disabled:opacity-60"
          style={{ borderRadius: '4px' }}
        >
          {loading ? 'Loading…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}


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
  const [addedGuest, setAddedGuest] = useState(existingPlusOne);

  async function handleAddGuest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rsvp/plus-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, guestName: guestName.trim(), guestEmail: guestEmail.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setAddedGuest({ id: '', guestName: guestName.trim(), guestEmail: guestEmail.trim() });
      setMode('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!addedGuest) return;
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
      <div className="mt-10 border-t border-events-line-soft pt-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-events-fg-soft mb-1">
              Guest
            </p>
            <p className="text-sm font-normal text-events-fg">{addedGuest.guestName}</p>
            <p className="text-xs text-events-fg-soft">{addedGuest.guestEmail}</p>
          </div>
          {addedGuest.id ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-events-fg-soft underline-offset-4 hover:underline"
            >
              <X className="h-3 w-3" />
              Remove guest
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (mode === 'form') {
    return (
      <div className="mt-10 border-t border-events-line-soft pt-8">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-events-fg-soft mb-6">
          Bring a guest
        </p>
        <form onSubmit={handleAddGuest} className="space-y-4 max-w-sm">
          <div>
            <label htmlFor="guest-name" className="block text-sm text-events-fg-soft mb-1">
              Guest name
            </label>
            <input
              id="guest-name"
              type="text"
              required
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              className="w-full border-0 border-b border-events-line-soft bg-transparent py-2 text-sm text-events-fg focus:outline-none focus:border-events-warm-accent"
            />
          </div>
          <div>
            <label htmlFor="guest-email" className="block text-sm text-events-fg-soft mb-1">
              Guest email
            </label>
            <input
              id="guest-email"
              type="email"
              required
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className="w-full border-0 border-b border-events-line-soft bg-transparent py-2 text-sm text-events-fg focus:outline-none focus:border-events-warm-accent"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600">{error}</p>
          ) : null}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => setMode('collapsed')}
              className="text-sm text-events-fg-soft underline-offset-4 hover:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="border border-events-cta-border px-6 py-3 text-[0.65rem] font-medium uppercase tracking-[0.22em] text-events-fg transition-colors hover:border-nobc-red hover:bg-nobc-red hover:text-nobc-on-red disabled:opacity-50"
              style={{ borderRadius: '4px' }}
            >
              {loading ? 'Adding…' : 'Add guest'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-10 border-t border-events-line-soft pt-8">
      <button
        type="button"
        onClick={() => setMode('form')}
        className="flex items-center gap-2 text-sm font-normal italic text-events-fg-soft underline-offset-4 hover:underline"
      >
        <UserPlus className="h-4 w-4" aria-hidden />
        Bring a guest
      </button>
    </div>
  );
}

type Props = { event: EventDetailDTO };

export function EventDetail({ event }: Props) {
  const applyHref = useMemberApplyHref();
  const heroSrc = event.heroImageUrl ?? null;
  const start = parseDate(event.startAt);
  const dateCaps = formatCapsDateLine(start);
  const timeLine = formatTimeLine(start);
  const locationCaps = event.location ? event.location.toUpperCase() : null;
  const showPrice = event.priceInCents != null && event.priceInCents > 0;
  const isFull = event.capacity != null && event.capacityUsedCount >= event.capacity;
  const hasCustomQuestions = event.customQuestions.length > 0;
  const isPaidTicketed =
    (event.accessMode === 'TICKETED' || event.accessMode === 'APPLY_OR_PAY') &&
    (event.priceInCents ?? 0) > 0;

  const searchParams = useSearchParams();
  const [successBannerDismissed, setSuccessBannerDismissed] = useState(false);
  const showSuccessBanner = searchParams.get('rsvp') === 'success' && !successBannerDismissed;

  const [rsvpStep, setRsvpStep] = useState<'cta' | 'questions'>('cta');
  const [rsvpState, setRsvpState] = useState<
    'idle' | 'loading' | 'confirmed' | 'pending_approval' | 'waitlisted' | 'error'
  >(() => {
    if (!event.existingRsvp) return 'idle';
    if (event.existingRsvp.ticketStatus === 'pending_approval') return 'pending_approval';
    if (event.existingRsvp.ticketStatus === 'held') return 'idle';
    return 'confirmed';
  });
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [activeQrCode, setActiveQrCode] = useState<string | null>(event.memberQrCode);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function submitRsvp(customAnswers?: CustomAnswers) {
    setRsvpState('loading');
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.eventId, customAnswers }),
      });
      const data = (await res.json()) as {
        rsvpId?: string;
        memberQrCode?: string;
        ticketStatus?: string;
        waitlisted?: boolean;
        position?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      if (data.waitlisted) {
        setWaitlistPosition(data.position ?? null);
        setRsvpState('waitlisted');
      } else if (data.ticketStatus === 'pending_approval') {
        setRsvpState('pending_approval');
      } else {
        if (data.memberQrCode) setActiveQrCode(data.memberQrCode);
        setRsvpState('confirmed');
      }
    } catch {
      setRsvpState('error');
    }
  }

  async function handleCheckout() {
    setRsvpState('loading');
    setCheckoutError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.eventId }),
      });
      if (!res.ok) {
        const { error } = (await res.json()) as { error?: string };
        setCheckoutError(error ?? 'Unable to process checkout');
        setRsvpState('idle');
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setCheckoutError('Network error. Please try again.');
      setRsvpState('idle');
    }
  }

  function handleInitialCta() {
    if (!event.memberApproved) return;
    if (hasCustomQuestions && rsvpStep === 'cta') {
      setRsvpStep('questions');
      return;
    }
    if (isPaidTicketed) {
      void handleCheckout();
    } else {
      void submitRsvp();
    }
  }

  function handleQuestionsSubmit(answers: CustomAnswers) {
    if (isPaidTicketed) {
      void handleCheckout();
    } else {
      void submitRsvp(answers);
    }
  }

  const accessLabel = {
    OPEN: 'Open',
    TICKETED: 'Members',
    APPLY_OR_PAY: 'Apply to Attend',
  }[event.accessMode];

  const alreadyConfirmed = rsvpState === 'confirmed';

  return (
    <div className="flex min-h-screen flex-col bg-events-canvas text-events-fg">
      <MemberShellNav applyHref={applyHref} />

      <article className="flex flex-1 flex-col">
        {showSuccessBanner ? (
          <div
            role="status"
            className="flex items-center justify-between gap-4 bg-events-card px-6 py-4 border-b border-events-line-soft"
          >
            <p className="text-sm font-normal text-events-fg">
              You&rsquo;re confirmed! Check your email for details.
            </p>
            <button
              type="button"
              onClick={() => setSuccessBannerDismissed(true)}
              aria-label="Dismiss"
              className="shrink-0 text-events-fg-quiet hover:text-events-fg transition-colors"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}

        <section
          className="relative w-full min-h-[min(52vh,26rem)] sm:min-h-[min(58vh,32rem)]"
          aria-label="Event hero"
        >
          {heroSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={heroSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="events-ref-ph absolute inset-0" aria-hidden />
          )}
        </section>

        <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.35em] text-events-warm-accent">
            {accessLabel}
          </p>

          <h1 className="mt-4 max-w-4xl font-playfair text-[clamp(2.25rem,5.5vw,3.5rem)] font-normal leading-[1.08] tracking-tight text-events-fg">
            {event.title}
          </h1>

          <div className="mt-10 flex max-w-2xl flex-col gap-4 border-b border-events-line-soft pb-10">
            <p className="flex items-center gap-3 text-[0.65rem] font-normal uppercase tracking-[0.28em] text-events-fg-soft">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-events-fg-quiet" strokeWidth={1.25} aria-hidden />
              {dateCaps}
            </p>
            <p className="flex items-center gap-3 text-[0.65rem] font-normal uppercase tracking-[0.28em] text-events-fg-soft">
              <Clock className="h-3.5 w-3.5 shrink-0 text-events-fg-quiet" strokeWidth={1.25} aria-hidden />
              {timeLine}
            </p>
            {locationCaps ? (
              <p className="flex items-start gap-3 text-[0.65rem] font-normal uppercase tracking-[0.28em] text-events-fg-soft">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-events-fg-quiet" strokeWidth={1.25} aria-hidden />
                <span className="break-words">{locationCaps}</span>
              </p>
            ) : null}
          </div>

          {event.description ? (
            <div className="mx-auto mt-12 max-w-prose">
              <p className="whitespace-pre-wrap text-base font-normal leading-[1.85] text-events-fg md:text-lg">
                {event.description}
              </p>
            </div>
          ) : null}

          <div className="mx-auto mt-16 max-w-prose border-t border-events-line-soft pt-12">
            {rsvpState === 'confirmed' ? (
              <>
                <RsvpConfirmation event={event} qrCode={activeQrCode} />
                {event.plusOnesAllowed ? (
                  <PlusOneSection eventId={event.eventId} existingPlusOne={event.plusOneRsvp} />
                ) : null}
              </>
            ) : rsvpState === 'pending_approval' ? (
              <div className="rounded border border-events-line-soft px-6 py-6">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-events-fg-soft mb-2">
                  Request received
                </p>
                <p className="text-sm font-normal leading-relaxed text-events-fg">
                  The operator will review your request. You&rsquo;ll hear back shortly.
                </p>
              </div>
            ) : rsvpState === 'waitlisted' ? (
              <div className="rounded border border-events-line-soft px-6 py-6">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-events-fg-soft mb-2">
                  On the waitlist
                </p>
                <p className="text-sm font-normal leading-relaxed text-events-fg">
                  {waitlistPosition ? `You're #${waitlistPosition}.` : ''} We&rsquo;ll notify you if a spot opens.
                </p>
              </div>
            ) : rsvpStep === 'questions' ? (
              <CustomQuestionsForm
                questions={event.customQuestions}
                onSubmit={handleQuestionsSubmit}
                onBack={() => setRsvpStep('cta')}
                loading={rsvpState === 'loading'}
              />
            ) : (
              <>
                {showPrice ? (
                  <p className="mb-6 text-center text-[0.65rem] font-medium uppercase tracking-[0.28em] text-events-fg-soft sm:text-left">
                    {formatPrice(event.priceInCents!)}
                  </p>
                ) : null}

                {event.showCapacity && event.capacity ? (
                  <div className="mb-6">
                    <CapacityBadge used={event.capacityUsedCount} max={event.capacity} />
                  </div>
                ) : null}

                <div className="flex flex-col items-center gap-4 sm:items-start">
                  {isFull && !alreadyConfirmed ? (
                    <p className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-events-fg-soft">
                      This event is full.
                    </p>
                  ) : !event.memberApproved ? (
                    <div className="space-y-3">
                      <p className="text-sm font-normal leading-relaxed text-events-fg-soft max-w-sm">
                        This event is for members. Apply to join No Bad Company.
                      </p>
                      <a
                        href={applyHref}
                        className="inline-block border border-events-cta-border px-8 py-4 text-center text-[0.65rem] font-medium uppercase tracking-[0.24em] text-events-fg transition-colors hover:border-nobc-red hover:bg-nobc-red hover:text-nobc-on-red"
                        style={{ borderRadius: '4px' }}
                      >
                        Apply to Join
                      </a>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleInitialCta}
                      disabled={rsvpState === 'loading'}
                      aria-busy={rsvpState === 'loading'}
                      className="w-full border border-nobc-red bg-nobc-red px-8 py-4 text-center text-[0.65rem] font-medium uppercase tracking-[0.24em] text-nobc-on-red transition-colors hover:border-nobc-red-hover hover:bg-nobc-red-hover disabled:opacity-60 sm:w-auto sm:min-w-[14rem]"
                      style={{ borderRadius: '4px' }}
                    >
                      {rsvpState === 'loading'
                        ? 'Loading…'
                        : isPaidTicketed
                          ? `Pay & Reserve · ${formatPrice(event.priceInCents!)}`
                          : 'Reserve My Spot'}
                    </button>
                  )}

                  {rsvpState === 'error' || checkoutError ? (
                    <p role="alert" aria-live="assertive" className="text-sm text-red-600">
                      {checkoutError ?? 'Something went wrong. Try again.'}
                    </p>
                  ) : null}

                  {event.approvalRequired ? (
                    <p className="text-[0.65rem] font-normal uppercase tracking-[0.22em] text-events-fg-soft">
                      Subject to approval
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </article>

      <MemberShellFooter applyHref={applyHref} />
    </div>
  );
}
