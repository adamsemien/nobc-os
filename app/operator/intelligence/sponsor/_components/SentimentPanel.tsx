'use client';

import { useState, useTransition } from 'react';
import { regenerateAudienceNarrative } from '../actions';

const DISPLAY = 'var(--font-display)';

export function SentimentPanel({
  workspaceId,
  initialNarrative,
}: {
  workspaceId: string;
  initialNarrative: string | null;
}) {
  const [narrative, setNarrative] = useState(initialNarrative ?? '');
  const [pending, startTransition] = useTransition();

  const regenerate = () => {
    startTransition(async () => {
      try {
        const fresh = await regenerateAudienceNarrative(workspaceId);
        setNarrative(fresh);
      } catch (err) {
        // Keep the current narrative on failure — never blank the panel.
        console.error('[sponsor] regenerate failed:', err);
      }
    });
  };

  return (
    <section className="grid grid-cols-1 gap-x-16 gap-y-10 py-16 lg:grid-cols-12">
      {/* Left — identity + control */}
      <div className="lg:col-span-5">
        <p
          className="text-[11px] uppercase"
          style={{ letterSpacing: '0.22em', color: 'var(--text-secondary)' }}
        >
          Sentiment &amp; Alignment
        </p>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
          Generated from member intelligence signals · refreshes hourly
        </p>

        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className="mt-6 text-[11px] uppercase disabled:opacity-50"
          style={{ letterSpacing: '0.2em', color: 'var(--accent)' }}
        >
          Regenerate
        </button>
      </div>

      {/* Right — narrative */}
      <div className="lg:col-span-7">
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
