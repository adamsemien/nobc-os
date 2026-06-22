'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import QRCode from 'qrcode';
import { Loader2, CalendarPlus } from 'lucide-react';
import type { EventDetailDTO, CustomQuestionDTO, TicketTierDTO } from './EventDetail';
import { formatGateCTA } from '@/lib/event-access';

type Props = {
  event: EventDetailDTO;
  open: boolean;
  onClose: () => void;
  onComplete: (result: {
    ticketStatus?: string;
    memberQrCode?: string | null;
    waitlisted?: boolean;
    position?: number | null;
  }) => void;
};

type Screen =
  | { kind: 'auth'; key: string }
  | { kind: 'guestInfo'; key: string }
  | { kind: 'fields'; key: string; questions: CustomQuestionDTO[] }
  | { kind: 'tierSelect'; key: string; tiers: TicketTierDTO[] }
  | { kind: 'pay'; key: string }
  | { kind: 'submit'; key: string };

type FlowResult = {
  ticketStatus: string;
  paid: boolean;
  memberQrCode: string | null;
  waitlisted: boolean;
  position: number | null;
};

type FlowState = {
  guestName: string;
  guestEmail: string;
  answers: Record<string, string | boolean>;
  tierId: string | null;
  clientSecret: string | null;
  rsvpId: string | null;
  amountCents: number;
  errorMsg: string | null;
  submitting: boolean;
};

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  });
}

function buildScreens(event: EventDetailDTO): Screen[] {
  const isMember = event.resolved.kind === 'member';
  const visibleQuestions = event.customQuestions.filter((q) =>
    isMember ? q.showToMember : q.showToGuest,
  );
  const style = event.eventAccess.registrationStyle ?? 'all_at_once';

  const out: Screen[] = [];
  for (const step of event.steps) {
    if (step === 'auth') out.push({ kind: 'auth', key: 'auth' });
    else if (step === 'guestInfo') out.push({ kind: 'guestInfo', key: 'guestInfo' });
    else if (step === 'fieldsBefore' || step === 'fieldsAfter') {
      if (visibleQuestions.length === 0) continue;
      if (style === 'one_at_a_time') {
        visibleQuestions.forEach((q) =>
          out.push({ kind: 'fields', key: `f-${q.id}`, questions: [q] }),
        );
      } else {
        out.push({ kind: 'fields', key: 'fields', questions: visibleQuestions });
      }
    } else if (step === 'pay') {
      if (event.tiers.length > 0) {
        out.push({ kind: 'tierSelect', key: 'tierSelect', tiers: event.tiers });
      }
      out.push({ kind: 'pay', key: 'pay' });
    }
    else if (step === 'submit') out.push({ kind: 'submit', key: 'submit' });
  }
  // Pay is terminal — drop a trailing confirm screen when payment is in the flow.
  if (out.some((s) => s.kind === 'pay')) {
    return out.filter((s) => s.kind !== 'submit');
  }
  return out;
}

export function EventAccessFlow({ event, open, onClose, onComplete }: Props) {
  const screens = useMemo(() => buildScreens(event), [event]);
  const [stepIdx, setStepIdx] = useState(0);
  const [entered, setEntered] = useState(false);
  const [result, setResult] = useState<FlowResult | null>(null);
  const [state, setState] = useState<FlowState>(() => emptyState());

  function emptyState(): FlowState {
    return {
      guestName: '',
      guestEmail: '',
      answers: {},
      tierId: null,
      clientSecret: null,
      rsvpId: null,
      amountCents: 0,
      errorMsg: null,
      submitting: false,
    };
  }

  useEffect(() => {
    if (open) {
      const r = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(r);
    }
    setEntered(false);
    setStepIdx(0);
    setResult(null);
    setState(emptyState());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const screen = screens[stepIdx];
  const isPayScreen = screen?.kind === 'pay';

  // Prepare the PaymentIntent when the pay screen is reached.
  useEffect(() => {
    if (!open || !isPayScreen) return;
    if (state.clientSecret || state.submitting) return;
    void (async () => {
      setState((s) => ({ ...s, submitting: true, errorMsg: null }));
      try {
        const res = await fetch(`/api/m/events/${event.slug}/access/payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guestEmail: state.guestEmail || undefined,
            guestName: state.guestName || undefined,
            customAnswers: state.answers,
            tierId: state.tierId || undefined,
          }),
        });
        const data = (await res.json()) as {
          clientSecret?: string;
          rsvpId?: string;
          amountCents?: number;
          error?: string;
          code?: string;
          comp?: boolean;
          ticketStatus?: string;
          memberQrCode?: string | null;
        };
        // Operator bypass: payment-intent returned a complimentary confirmation (no Stripe).
        if (data.comp) {
          setState((s) => ({ ...s, submitting: false }));
          setResult({
            ticketStatus: data.ticketStatus ?? 'confirmed',
            paid: false,
            memberQrCode: data.memberQrCode ?? null,
            waitlisted: false,
            position: null,
          });
          return;
        }
        if (!res.ok || !data.clientSecret) {
          if (data.code === 'membership_required') {
            window.location.href = `/apply?return=${encodeURIComponent(`/m/events/${event.slug}`)}`;
            return;
          }
          throw new Error(data.error ?? 'Could not start payment');
        }
        setState((s) => ({
          ...s,
          clientSecret: data.clientSecret!,
          rsvpId: data.rsvpId ?? null,
          amountCents: data.amountCents ?? 0,
          submitting: false,
        }));
      } catch (e) {
        setState((s) => ({
          ...s,
          submitting: false,
          errorMsg: e instanceof Error ? e.message : 'Could not start payment',
        }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPayScreen]);

  if (!open || screens.length === 0) return null;

  const cta = formatGateCTA(event.resolved);
  const lastIdx = screens.length - 1;

  function goNext() {
    setState((s) => ({ ...s, errorMsg: null }));
    setStepIdx((i) => Math.min(i + 1, lastIdx));
  }
  function goBack() {
    if (stepIdx === 0) onClose();
    else {
      setState((s) => ({ ...s, errorMsg: null }));
      setStepIdx((i) => Math.max(0, i - 1));
    }
  }

  async function submitFree() {
    setState((s) => ({ ...s, submitting: true, errorMsg: null }));
    try {
      const res = await fetch(`/api/m/events/${event.slug}/access/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestEmail: state.guestEmail || undefined,
          guestName: state.guestName || undefined,
          customAnswers: state.answers,
          tierId: state.tierId || undefined,
        }),
      });
      const data = (await res.json()) as {
        rsvpId?: string;
        ticketStatus?: string;
        memberQrCode?: string | null;
        waitlisted?: boolean;
        position?: number;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (data.code === 'membership_required') {
          window.location.href = `/apply?return=${encodeURIComponent(`/m/events/${event.slug}`)}`;
          return;
        }
        throw new Error(data.error ?? 'Submission failed');
      }
      setState((s) => ({ ...s, submitting: false }));
      setResult({
        ticketStatus: data.ticketStatus ?? 'confirmed',
        paid: false,
        memberQrCode: data.memberQrCode ?? null,
        waitlisted: Boolean(data.waitlisted),
        position: data.position ?? null,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        submitting: false,
        errorMsg: e instanceof Error ? e.message : 'Submission failed',
      }));
    }
  }

  function finishAndClose() {
    if (result) {
      onComplete({
        ticketStatus: result.ticketStatus,
        memberQrCode: result.memberQrCode,
        waitlisted: result.waitlisted,
        position: result.position,
      });
    } else {
      onClose();
    }
  }

  const showDone = result !== null;
  const dotCount = showDone ? screens.length : screens.length;
  const dotActive = showDone ? dotCount : stepIdx;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Event registration"
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end justify-center transition-colors duration-300 sm:items-center ${
        entered ? 'bg-black/55' : 'bg-black/0'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-[460px] rounded-t-[14px] bg-events-paper shadow-[0_-2px_28px_rgba(0,0,0,0.22)] transition-all duration-300 ease-out sm:rounded-[14px] ${
          entered
            ? 'translate-y-0 opacity-100 sm:scale-100'
            : 'translate-y-full opacity-0 sm:translate-y-0 sm:scale-95'
        }`}
      >
        {showDone ? (
          <DoneScreen event={event} result={result!} onClose={finishAndClose} />
        ) : (
          <>
            <FlowHeader
              title={event.title}
              cta={cta}
              dotCount={dotCount}
              dotActive={dotActive}
              atStart={stepIdx === 0}
              onBack={goBack}
              onClose={onClose}
            />
            <div className="px-4 pb-7 sm:px-8 sm:pb-8">
              <ScreenFade screenKey={screen?.key ?? 'x'}>
                {screen?.kind === 'auth' && <AuthStep />}

                {screen?.kind === 'guestInfo' && (
                  <GuestInfoStep
                    name={state.guestName}
                    email={state.guestEmail}
                    error={state.errorMsg}
                    onChange={(name, email) =>
                      setState((s) => ({ ...s, guestName: name, guestEmail: email }))
                    }
                    onNext={() => {
                      if (!state.guestName.trim() || !state.guestEmail.trim()) {
                        setState((s) => ({
                          ...s,
                          errorMsg: 'Please add your name and email.',
                        }));
                        return;
                      }
                      goNext();
                    }}
                  />
                )}

                {screen?.kind === 'fields' && (
                  <FieldsStep
                    questions={screen.questions}
                    answers={state.answers}
                    error={state.errorMsg}
                    single={screen.questions.length === 1}
                    isLast={stepIdx === lastIdx}
                    submitting={state.submitting}
                    onChange={(answers) => setState((s) => ({ ...s, answers }))}
                    onNext={() => {
                      if (stepIdx === lastIdx) void submitFree();
                      else goNext();
                    }}
                  />
                )}

                {screen?.kind === 'tierSelect' && (
                  <TierSelectStep
                    tiers={screen.tiers}
                    isMember={event.viewer === 'member'}
                    selectedTierId={state.tierId}
                    onSelect={(id) => setState((s) => ({ ...s, tierId: id, errorMsg: null }))}
                    onNext={() => {
                      if (!state.tierId) {
                        setState((s) => ({ ...s, errorMsg: 'Please select a ticket type.' }));
                        return;
                      }
                      goNext();
                    }}
                    error={state.errorMsg}
                  />
                )}

                {screen?.kind === 'pay' && (
                  <PayStep
                    clientSecret={state.clientSecret}
                    amountCents={state.amountCents}
                    error={state.errorMsg}
                    onSuccess={() =>
                      setResult({
                        ticketStatus: 'confirmed',
                        paid: true,
                        memberQrCode: null,
                        waitlisted: false,
                        position: null,
                      })
                    }
                  />
                )}

                {screen?.kind === 'submit' && (
                  <SubmitStep
                    ctaLabel={cta}
                    needsApproval={event.resolved.kind !== 'closed' &&
                      event.resolved.flow.includes('approval')}
                    submitting={state.submitting}
                    error={state.errorMsg}
                    onSubmit={() => void submitFree()}
                  />
                )}
              </ScreenFade>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ScreenFade({
  screenKey,
  children,
}: {
  screenKey: string;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [screenKey]);
  return (
    <div
      className={`transition-all duration-300 ease-out ${
        shown ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

function FlowHeader({
  title,
  cta,
  dotCount,
  dotActive,
  atStart,
  onBack,
  onClose,
}: {
  title: string;
  cta: string;
  dotCount: number;
  dotActive: number;
  atStart: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="px-4 pt-5 sm:px-8 sm:pt-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center min-h-[44px] -mx-2 px-2 text-[11px] uppercase tracking-widest text-[var(--apply-muted)] underline-offset-4 hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
        >
          {atStart ? 'Cancel' : '← Back'}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] -mx-2 text-lg leading-none text-[var(--apply-muted)] hover:text-[var(--nobc-red)]"
        >
          ✕
        </button>
      </div>

      <p className="mt-4 text-[22px] leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
        {title}
      </p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
        {cta}
      </p>

      <div className="mt-4 mb-5 flex items-center gap-1.5">
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < dotActive ? 'bg-[var(--nobc-red)]' : 'bg-[var(--apply-rule)]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
      {children}
    </span>
  );
}

const inputCls =
  'w-full rounded-sm border border-[var(--apply-rule)] bg-white px-3.5 py-3 text-[15px] text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none focus:ring-1 focus:ring-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]';

const primaryBtnCls =
  'w-full rounded-sm bg-[var(--nobc-red)] px-5 py-3.5 text-center text-[12px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] transition-colors hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] disabled:opacity-60 font-[family-name:var(--font-dm-sans)]';

function ErrorText({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p
      role="alert"
      className="text-sm text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]"
    >
      {msg}
    </p>
  );
}

function AuthStep() {
  return (
    <div className="space-y-5">
      <p className="text-[15px] leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        This event is open to NoBC members. Sign in to continue.
      </p>
      <a href="/sign-in" className={primaryBtnCls + ' block'}>
        Sign in
      </a>
    </div>
  );
}

const GUEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function GuestInfoStep({
  name,
  email,
  error,
  onChange,
  onNext,
}: {
  name: string;
  email: string;
  error: string | null;
  onChange: (n: string, e: string) => void;
  onNext: () => void;
}) {
  const [touched, setTouched] = useState({ name: false, email: false });
  const nameErr = touched.name && !name.trim() ? 'Please add your name.' : '';
  const emailErr =
    touched.email && !email.trim()
      ? 'Please add your email.'
      : touched.email && !GUEST_EMAIL_RE.test(email.trim())
        ? 'Enter a valid email address.'
        : '';
  const canContinue = name.trim().length > 0 && GUEST_EMAIL_RE.test(email.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched({ name: true, email: true });
        if (!canContinue) return;
        onNext();
      }}
      className="space-y-5"
    >
      <div>
        <FieldLabel>Your name</FieldLabel>
        <input
          type="text"
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(e) => onChange(e.target.value, email)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          placeholder="First and last name"
          className={inputCls}
        />
        {nameErr ? (
          <p role="alert" className="mt-1 text-xs text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            {nameErr}
          </p>
        ) : null}
      </div>
      <div>
        <FieldLabel>Email</FieldLabel>
        <input
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => onChange(name, e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          placeholder="you@email.com"
          className={inputCls}
        />
        {emailErr ? (
          <p role="alert" className="mt-1 text-xs text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
            {emailErr}
          </p>
        ) : null}
      </div>
      <ErrorText msg={error} />
      <button type="submit" disabled={!canContinue} className={primaryBtnCls}>
        Continue →
      </button>
    </form>
  );
}

function FieldsStep({
  questions,
  answers,
  error,
  single,
  isLast,
  submitting,
  onChange,
  onNext,
}: {
  questions: CustomQuestionDTO[];
  answers: Record<string, string | boolean>;
  error: string | null;
  single: boolean;
  isLast: boolean;
  submitting: boolean;
  onChange: (a: Record<string, string | boolean>) => void;
  onNext: () => void;
}) {
  function update(id: string, value: string | boolean) {
    onChange({ ...answers, [id]: value });
  }
  const label = isLast ? 'Complete registration' : 'Continue →';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className={single ? 'space-y-6' : 'space-y-5'}
    >
      {questions.map((q) => (
        <div key={q.id}>
          <span
            className={
              single
                ? 'mb-3 block text-[20px] leading-snug text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]'
                : 'mb-1.5 block text-[13px] font-medium text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]'
            }
          >
            {q.label}
            {q.required ? (
              <span aria-hidden className="ml-1 text-[var(--nobc-red)]">
                *
              </span>
            ) : null}
          </span>
          {q.type === 'textarea' ? (
            <textarea
              rows={single ? 4 : 3}
              required={q.required}
              autoFocus={single}
              value={String(answers[q.id] ?? '')}
              onChange={(e) => update(q.id, e.target.value)}
              className={inputCls + ' resize-none'}
            />
          ) : q.type === 'select' && q.options ? (
            <select
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={(e) => update(q.id, e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {q.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : q.type === 'checkbox' ? (
            <label className="flex cursor-pointer items-center gap-3 font-[family-name:var(--font-dm-sans)]">
              <input
                type="checkbox"
                required={q.required}
                checked={Boolean(answers[q.id])}
                onChange={(e) => update(q.id, e.target.checked)}
                className="h-5 w-5 accent-[var(--nobc-red)]"
              />
              <span className="text-[15px] text-[var(--apply-ink)]">Yes</span>
            </label>
          ) : (
            <input
              type={q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : 'text'}
              required={q.required}
              autoFocus={single}
              value={String(answers[q.id] ?? '')}
              onChange={(e) => update(q.id, e.target.value)}
              className={inputCls}
            />
          )}
        </div>
      ))}
      <ErrorText msg={error} />
      <button type="submit" disabled={submitting} className={primaryBtnCls}>
        {submitting ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : (
          label
        )}
      </button>
    </form>
  );
}

function PayStep({
  clientSecret,
  amountCents,
  error,
  onSuccess,
}: {
  clientSecret: string | null;
  amountCents: number;
  error: string | null;
  onSuccess: () => void;
}) {
  const stripeP = useMemo(() => getStripe(), []);

  if (error) {
    return <ErrorText msg={error} />;
  }
  if (!clientSecret) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing secure checkout…
      </p>
    );
  }

  return (
    <Elements
      stripe={stripeP}
      options={{
        clientSecret,
        appearance: {
          theme: 'flat',
          variables: {
            colorPrimary: '#B22E21',
            colorBackground: '#FFFFFF',
            colorText: '#1C1008',
            fontFamily: 'DM Sans, system-ui, sans-serif',
            borderRadius: '6px',
          },
        },
      }}
    >
      <PayForm amountCents={amountCents} onSuccess={onSuccess} />
    </Elements>
  );
}

function PayForm({
  amountCents,
  onSuccess,
}: {
  amountCents: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasExpress, setHasExpress] = useState(false);

  async function confirm() {
    if (!stripe || !elements) return false;
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: typeof window !== 'undefined' ? window.location.href : '',
      },
      redirect: 'if_required',
    });
    if (error) {
      setErr(error.message ?? 'Payment failed');
      return false;
    }
    if (
      paymentIntent &&
      (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')
    ) {
      return true;
    }
    return false;
  }

  async function handleCardSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const ok = await confirm();
    if (ok) onSuccess();
    else setBusy(false);
  }

  return (
    <form onSubmit={handleCardSubmit} className="space-y-4">
      <div className={hasExpress ? '' : 'hidden'}>
        <ExpressCheckoutElement
          onReady={({ availablePaymentMethods }) =>
            setHasExpress(Boolean(availablePaymentMethods))
          }
          onConfirm={async () => {
            setBusy(true);
            setErr(null);
            const ok = await confirm();
            if (ok) onSuccess();
            else setBusy(false);
          }}
        />
        <div className="my-3 flex items-center gap-2">
          <span className="h-px flex-1 bg-[var(--apply-rule)]" />
          <span className="text-[10px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            or pay by card
          </span>
          <span className="h-px flex-1 bg-[var(--apply-rule)]" />
        </div>
      </div>

      <PaymentElement />

      <div className="flex items-center justify-between border-t border-[var(--apply-rule)] pt-3 text-sm font-[family-name:var(--font-dm-sans)]">
        <span className="text-[var(--apply-muted)]">Total</span>
        <span className="font-medium text-[var(--apply-ink)]">
          {formatPrice(amountCents)}
        </span>
      </div>

      {err ? <ErrorText msg={err} /> : null}

      <button type="submit" disabled={!stripe || busy} className={primaryBtnCls}>
        {busy ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : (
          'Complete registration'
        )}
      </button>
    </form>
  );
}

function SubmitStep({
  ctaLabel,
  needsApproval,
  submitting,
  error,
  onSubmit,
}: {
  ctaLabel: string;
  needsApproval: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-[15px] leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        {needsApproval
          ? 'Submit your request — the operator will review it and you’ll hear back shortly.'
          : 'You’re all set. Confirm to lock in your spot.'}
      </p>
      <ErrorText msg={error} />
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className={primaryBtnCls}
      >
        {submitting ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : (
          ctaLabel
        )}
      </button>
    </div>
  );
}

function calendarUrl(event: EventDetailDTO): string {
  const fmt = (v: string | Date) =>
    new Date(v).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = fmt(event.startAt);
  const end = event.endAt ? fmt(event.endAt) : start;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
  });
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function DoneScreen({
  event,
  result,
  onClose,
}: {
  event: EventDetailDTO;
  result: FlowResult;
  onClose: () => void;
}) {
  const pending = result.ticketStatus === 'pending_approval';
  const heading = result.waitlisted
    ? 'On the waitlist'
    : pending
      ? 'Request received'
      : result.paid
        ? 'Ticket confirmed'
        : 'You’re in';
  const confirmed = !result.waitlisted && !pending;

  const start = new Date(event.startAt);
  const dateLine = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(start);
  const timeLine = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(start);

  return (
    <div className="px-4 pb-8 pt-9 text-center sm:px-8">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--nobc-red)] text-xl text-[var(--nobc-on-red)]">
        {confirmed ? '✓' : '◷'}
      </div>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
        {heading}
      </p>
      <h2 className="mt-2 text-[34px] leading-[1.1] text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
        {event.title}
      </h2>

      <div className="mt-4 space-y-0.5 text-[13px] text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        <p>{dateLine}</p>
        <p>{timeLine}</p>
        {event.location ? <p>{event.location}</p> : null}
      </div>

      {confirmed && result.memberQrCode ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          <QrBlock code={result.memberQrCode} />
          <p className="text-[10px] uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
            Show this at the door
          </p>
        </div>
      ) : null}

      {result.waitlisted ? (
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
          {result.position ? `You're #${result.position}. ` : ''}
          We&rsquo;ll notify you if a spot opens.
        </p>
      ) : pending ? (
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
          You&rsquo;ll get an email as soon as the operator reviews your request.
        </p>
      ) : null}

      {confirmed ? (
        <a
          href={calendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] underline-offset-4 hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Add to calendar
        </a>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className={primaryBtnCls + ' mt-7'}
      >
        Done
      </button>
    </div>
  );
}

function TierSelectStep({
  tiers,
  isMember,
  selectedTierId,
  onSelect,
  onNext,
  error,
}: {
  tiers: TicketTierDTO[];
  isMember: boolean;
  selectedTierId: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
  error: string | null;
}) {
  const available = tiers.filter((t) => {
    const price = isMember ? t.memberPriceCents : t.nonMemberPriceCents;
    return price != null;
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {available.map((tier) => {
          const priceCents = isMember ? tier.memberPriceCents! : tier.nonMemberPriceCents!;
          const remaining = tier.quantity - tier.soldCount - tier.heldCount;
          const soldOut = remaining <= 0;
          const isSelected = selectedTierId === tier.id;

          return (
            <button
              key={tier.id}
              type="button"
              disabled={soldOut}
              onClick={() => !soldOut && onSelect(tier.id)}
              className={`w-full rounded-sm border px-4 py-3 text-left transition-colors disabled:opacity-50 font-[family-name:var(--font-dm-sans)] ${
                isSelected
                  ? 'border-[var(--nobc-red)] bg-[color-mix(in_oklab,var(--nobc-red)_6%,white)]'
                  : 'border-[var(--apply-rule)] bg-white hover:border-[var(--nobc-red)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-medium text-[var(--apply-ink)]">
                  {tier.name}
                </span>
                <span className="shrink-0 text-[14px] font-medium text-[var(--apply-ink)]">
                  {formatPrice(priceCents)}
                </span>
              </div>
              {tier.description ? (
                <p className="mt-1 text-[12px] text-[var(--apply-muted)]">{tier.description}</p>
              ) : null}
              {soldOut ? (
                <p className="mt-1 text-[11px] uppercase tracking-widest text-[var(--apply-muted)]">
                  Sold out
                </p>
              ) : null}
            </button>
          );
        })}
      </div>
      <ErrorText msg={error} />
      <button type="button" onClick={onNext} className={primaryBtnCls}>
        Continue →
      </button>
    </div>
  );
}

function QrBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(code, {
      type: 'svg',
      width: 180,
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
    return <div className="h-[180px] w-[180px] animate-pulse rounded-sm bg-events-paper" />;
  }
  return (
    <div
      className="[&_svg]:h-auto [&_svg]:max-w-[180px]"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
