'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import type { EventDetailDTO, CustomQuestionDTO } from './EventDetail';
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

type StepKey = 'auth' | 'guestInfo' | 'fieldsBefore' | 'pay' | 'fieldsAfter' | 'submit';

type FlowState = {
  guestName: string;
  guestEmail: string;
  answers: Record<string, string | boolean>;
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

function filterQuestions(
  questions: CustomQuestionDTO[],
  resolved: EventDetailDTO['resolved'],
  when: CustomQuestionDTO['whenInFlow'] | CustomQuestionDTO['whenInFlow'][],
): CustomQuestionDTO[] {
  const whenSet = new Set(Array.isArray(when) ? when : [when]);
  return questions.filter((q) => {
    if (!whenSet.has(q.whenInFlow)) return false;
    if (resolved.kind === 'member') return q.showToMember;
    if (resolved.kind === 'guest') return q.showToGuest;
    return false;
  });
}

export function EventAccessFlow({ event, open, onClose, onComplete }: Props) {
  const steps = event.steps;
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<FlowState>({
    guestName: '',
    guestEmail: '',
    answers: {},
    clientSecret: null,
    rsvpId: null,
    amountCents: 0,
    errorMsg: null,
    submitting: false,
  });

  useEffect(() => {
    if (!open) {
      setStepIdx(0);
      setState({
        guestName: '',
        guestEmail: '',
        answers: {},
        clientSecret: null,
        rsvpId: null,
        amountCents: 0,
        errorMsg: null,
        submitting: false,
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const stepKey = (steps[stepIdx] ?? 'submit') as StepKey;

  useEffect(() => {
    if (!open || stepKey !== 'pay') return;
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
          }),
        });
        const data = (await res.json()) as {
          clientSecret?: string;
          rsvpId?: string;
          amountCents?: number;
          error?: string;
        };
        if (!res.ok || !data.clientSecret) {
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
  }, [open, stepKey]);

  if (!open || steps.length === 0) return null;

  const cta = formatGateCTA(event.resolved);

  function goNext() {
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  }
  function goBack() {
    if (stepIdx === 0) onClose();
    else setStepIdx((i) => Math.max(0, i - 1));
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
        }),
      });
      const data = (await res.json()) as {
        rsvpId?: string;
        ticketStatus?: string;
        memberQrCode?: string | null;
        waitlisted?: boolean;
        position?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'Submission failed');
      onComplete({
        ticketStatus: data.ticketStatus,
        memberQrCode: data.memberQrCode,
        waitlisted: data.waitlisted,
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Event access flow"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-t-[10px] bg-[#F9F7F2] shadow-[0_-2px_20px_rgba(0,0,0,0.18)] sm:rounded-[10px]"
        onClick={(e) => e.stopPropagation()}
      >
        <FlowHeader
          title={event.title}
          cta={cta}
          steps={steps}
          stepIdx={stepIdx}
          onBack={goBack}
          onClose={onClose}
        />

        <div className="px-6 pb-6 sm:px-8 sm:pb-8">
          {stepKey === 'auth' && <AuthStep />}

          {stepKey === 'guestInfo' && (
            <GuestInfoStep
              name={state.guestName}
              email={state.guestEmail}
              onChange={(name, email) =>
                setState((s) => ({ ...s, guestName: name, guestEmail: email }))
              }
              onNext={() => {
                if (!state.guestName.trim() || !state.guestEmail.trim()) {
                  setState((s) => ({ ...s, errorMsg: 'Name and email required' }));
                  return;
                }
                setState((s) => ({ ...s, errorMsg: null }));
                goNext();
              }}
              error={state.errorMsg}
            />
          )}

          {(stepKey === 'fieldsBefore' || stepKey === 'fieldsAfter') && (
            <FieldsStep
              questions={filterQuestions(
                event.customQuestions,
                event.resolved,
                stepKey === 'fieldsBefore'
                  ? ['BEFORE_SUBMIT', 'BEFORE_APPROVAL']
                  : 'AFTER_PAYMENT',
              )}
              answers={state.answers}
              onChange={(answers) => setState((s) => ({ ...s, answers }))}
              onNext={goNext}
              error={state.errorMsg}
            />
          )}

          {stepKey === 'pay' && (
            <PayStep
              clientSecret={state.clientSecret}
              amountCents={state.amountCents}
              error={state.errorMsg}
              onSuccess={() => {
                onComplete({ ticketStatus: 'confirmed', memberQrCode: null });
              }}
            />
          )}

          {stepKey === 'submit' && (
            <SubmitStep
              ctaLabel={cta}
              submitting={state.submitting}
              error={state.errorMsg}
              onSubmit={submitFree}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FlowHeader({
  title,
  cta,
  steps,
  stepIdx,
  onBack,
  onClose,
}: {
  title: string;
  cta: string;
  steps: StepKey[];
  stepIdx: number;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="px-6 pt-5 sm:px-8 sm:pt-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] uppercase tracking-widest text-[var(--apply-muted)] underline-offset-4 hover:text-[var(--nobc-red)] hover:underline font-[family-name:var(--font-dm-sans)]"
        >
          {stepIdx === 0 ? 'Cancel' : '← Back'}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[var(--apply-muted)] hover:text-[var(--nobc-red)]"
        >
          ✕
        </button>
      </div>

      <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        {title}
      </p>
      <h2 className="mt-1 text-[26px] leading-tight text-[var(--apply-ink)] font-[family-name:var(--font-cormorant)]">
        {cta}
      </h2>

      <div className="mt-4 mb-4 flex items-center gap-1.5">
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= stepIdx ? 'bg-[var(--nobc-red)]' : 'bg-[var(--apply-rule)]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function AuthStep() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        This event is open to NoBC members. Sign in to continue.
      </p>
      <a
        href="/sign-in"
        className="inline-block w-full rounded-sm bg-[var(--nobc-red)] px-5 py-3 text-center text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] font-[family-name:var(--font-dm-sans)]"
      >
        Sign in
      </a>
    </div>
  );
}

function GuestInfoStep({
  name,
  email,
  onChange,
  onNext,
  error,
}: {
  name: string;
  email: string;
  onChange: (n: string, e: string) => void;
  onNext: () => void;
  error: string | null;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="space-y-4"
    >
      <div>
        <label
          htmlFor="flow-name"
          className="mb-1 block text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
        >
          Your name
        </label>
        <input
          id="flow-name"
          type="text"
          required
          value={name}
          onChange={(e) => onChange(e.target.value, email)}
          className="w-full border-0 border-b border-[var(--apply-rule)] bg-transparent py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
        />
      </div>
      <div>
        <label
          htmlFor="flow-email"
          className="mb-1 block text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
        >
          Email
        </label>
        <input
          id="flow-email"
          type="email"
          required
          value={email}
          onChange={(e) => onChange(name, e.target.value)}
          className="w-full border-0 border-b border-[var(--apply-rule)] bg-transparent py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="w-full rounded-sm bg-[var(--nobc-red)] px-5 py-3 text-center text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] font-[family-name:var(--font-dm-sans)]"
      >
        Continue
      </button>
    </form>
  );
}

function FieldsStep({
  questions,
  answers,
  onChange,
  onNext,
  error,
}: {
  questions: CustomQuestionDTO[];
  answers: Record<string, string | boolean>;
  onChange: (a: Record<string, string | boolean>) => void;
  onNext: () => void;
  error: string | null;
}) {
  // If filtered set is empty, auto-advance.
  useEffect(() => {
    if (questions.length === 0) onNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length]);

  if (questions.length === 0) return null;

  function update(id: string, value: string | boolean) {
    onChange({ ...answers, [id]: value });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
      className="space-y-4"
    >
      {questions.map((q) => (
        <div key={q.id}>
          <label
            htmlFor={`cq-${q.id}`}
            className="mb-1 block text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]"
          >
            {q.label}
            {q.required ? (
              <span aria-hidden className="ml-1 text-[var(--nobc-red)]">
                *
              </span>
            ) : null}
          </label>
          {q.type === 'textarea' ? (
            <textarea
              id={`cq-${q.id}`}
              rows={3}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={(e) => update(q.id, e.target.value)}
              className="w-full resize-none border-0 border-b border-[var(--apply-rule)] bg-transparent py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            />
          ) : q.type === 'select' && q.options ? (
            <select
              id={`cq-${q.id}`}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={(e) => update(q.id, e.target.value)}
              className="w-full border-0 border-b border-[var(--apply-rule)] bg-transparent py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
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
                id={`cq-${q.id}`}
                type="checkbox"
                required={q.required}
                checked={Boolean(answers[q.id])}
                onChange={(e) => update(q.id, e.target.checked)}
                className="h-4 w-4 accent-[var(--nobc-red)]"
              />
              <span className="text-sm text-[var(--apply-ink)]">{q.label}</span>
            </label>
          ) : (
            <input
              id={`cq-${q.id}`}
              type={q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : q.type}
              required={q.required}
              value={String(answers[q.id] ?? '')}
              onChange={(e) => update(q.id, e.target.value)}
              className="w-full border-0 border-b border-[var(--apply-rule)] bg-transparent py-2 text-sm text-[var(--apply-ink)] focus:border-[var(--nobc-red)] focus:outline-none font-[family-name:var(--font-dm-sans)]"
            />
          )}
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="w-full rounded-sm bg-[var(--nobc-red)] px-5 py-3 text-center text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] font-[family-name:var(--font-dm-sans)]"
      >
        Continue
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
    return (
      <p role="alert" className="text-sm text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
        {error}
      </p>
    );
  }
  if (!clientSecret) {
    return (
      <p className="text-sm text-[var(--apply-muted)] font-[family-name:var(--font-dm-sans)]">
        Preparing payment…
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
            colorBackground: '#FFFCF6',
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

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: typeof window !== 'undefined' ? window.location.href : '',
      },
      redirect: 'if_required',
    });
    if (error) {
      setErr(error.message ?? 'Payment failed');
      setBusy(false);
      return;
    }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onSuccess();
      return;
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <PaymentElement />
      {err ? (
        <p role="alert" className="text-sm text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
          {err}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full rounded-sm bg-[var(--nobc-red)] px-5 py-3 text-center text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] transition-colors hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] disabled:opacity-60 font-[family-name:var(--font-dm-sans)]"
      >
        {busy ? 'Processing…' : `Pay ${formatPrice(amountCents)}`}
      </button>
    </form>
  );
}

function SubmitStep({
  ctaLabel,
  submitting,
  error,
  onSubmit,
}: {
  ctaLabel: string;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--apply-ink)] font-[family-name:var(--font-dm-sans)]">
        Ready to confirm.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-[var(--nobc-red)] font-[family-name:var(--font-dm-sans)]">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="w-full rounded-sm bg-[var(--nobc-red)] px-5 py-3 text-center text-[11px] font-medium uppercase tracking-widest text-[var(--nobc-on-red)] transition-colors hover:bg-[color-mix(in_oklab,var(--nobc-red)_86%,black)] disabled:opacity-60 font-[family-name:var(--font-dm-sans)]"
      >
        {submitting ? 'Submitting…' : ctaLabel}
      </button>
    </div>
  );
}
