'use client';

import { useState, useTransition } from 'react';
import { regenerateAudienceNarrative } from '../actions';

const DISPLAY = 'var(--font-display)';

export function SentimentPanel({
  initialNarrative,
}: {
  initialNarrative: string | null;
}) {
  const [narrative, setNarrative] = useState(initialNarrative ?? '');
  const [pending, startTransition] = useTransition();

  const regenerate = () => {
    startTransition(async () => {
      try {
        const fresh = await regenerateAudienceNarrative();
        setNarrative(fresh);
      } catch (err) {
        // Keep the current narrative on failure — never blank the panel.
        console.error('[sponsor] regenerate failed:', err);
      }
    });
  };

  return (
    <section className="py-16">
      {/* Header row — eyebrow + subtitle on the left, Regenerate top-right. A short
          header above a prose block reads cleaner than a short column beside a tall
          one, which would strand the narrative in a half-column and leave a void. */}
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p
            className="text-[12px] uppercase"
            style={{ letterSpacing: '0.26em', color: 'var(--text-secondary)' }}
          >
            Sentiment &amp; Alignment
          </p>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
            Generated from member intelligence signals · refreshes hourly
          </p>
        </div>

        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className="text-[12px] uppercase disabled:opacity-50"
          style={{ letterSpacing: '0.2em', color: 'var(--accent)' }}
        >
          Regenerate
        </button>
      </div>

      {/* Narrative — breaks full width, capped to a comfortable reading measure. */}
      <div className="mt-8 max-w-4xl">
        {pending ? (
          <p
            className="text-2xl italic"
            style={{
              fontFamily: DISPLAY,
              color: 'var(--text-tertiary)',
              animation: 'nobc-pulse-soft 1.6s ease-in-out infinite',
            }}
          >
            Synthesizing audience intelligence…
          </p>
        ) : narrative ? (
          <blockquote
            className="text-2xl italic leading-relaxed"
            style={{
              fontFamily: DISPLAY,
              color: 'var(--text-primary)',
              borderLeft: '3px solid var(--accent)',
              paddingLeft: '1.25rem',
            }}
          >
            {narrative}
          </blockquote>
        ) : (
          <p className="text-lg italic" style={{ fontFamily: DISPLAY, color: 'var(--text-tertiary)' }}>
            Narrative unavailable right now.
          </p>
        )}
      </div>
    </section>
  );
}
