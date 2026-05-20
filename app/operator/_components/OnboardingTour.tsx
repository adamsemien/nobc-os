'use client';

import { useEffect, useState } from 'react';

const LS_KEY = 'nobc-onboarding-dismissed';

const STEPS = [
  {
    title: 'Welcome to NoBC OS.',
    body: 'This dashboard shows what needs your attention right now. New applications, upcoming events, recent activity.',
  },
  {
    title: 'Applications come in here.',
    body: 'Anyone applying through /apply lands in the Applications tab. Click any to review — score, archetype, AI recommendation, and answers.',
  },
  {
    title: 'Create events here.',
    body: "Events live under Events. When you create one, you'll pick a Workflow — who can RSVP, who pays, who gets approved.",
  },
  {
    title: 'On event day, The Room is your live ops screen.',
    body: 'Tablet-optimized, dark mode, real-time arrivals, the AI vibe descriptor. Open it from any event detail page or from your dashboard.',
  },
  {
    title: 'Need help?',
    body: 'Click the ? icon (bottom left) any time. Or hit Cmd+Option+A to ask the AI agent.',
  },
];

export function OnboardingTour({
  hasEvents,
  hasMembers,
}: {
  hasEvents: boolean;
  hasMembers: boolean;
}) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (hasEvents || hasMembers) return;
    try {
      const dismissed = localStorage.getItem(LS_KEY) === 'true';
      if (!dismissed) setActive(true);
    } catch {}
  }, [hasEvents, hasMembers]);

  function dismiss() {
    setActive(false);
    try { localStorage.setItem(LS_KEY, 'true'); } catch {}
  }

  if (!active) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center px-4 pb-8 sm:items-center sm:pb-0"
      style={{ background: 'color-mix(in srgb, var(--foreground) 35%, transparent)' }}
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-lg border p-6 shadow-lg"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="mb-1 text-[11px] uppercase tracking-[0.2em] text-text-secondary"
        >
          {step + 1} of {STEPS.length}
        </p>
        <h2
          className="mb-2 text-xl text-text-primary"
          style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}
        >
          {current.title}
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-text-secondary">
          {current.body}
        </p>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-text-secondary underline-offset-2 hover:underline"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-text-primary hover:border-primary"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
              className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
