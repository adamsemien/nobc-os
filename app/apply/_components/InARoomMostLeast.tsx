'use client';

/**
 * most-least — one list of six; pick exactly one MOST and one LEAST, mutually
 * exclusive (Apply Scoring v2, Phase 4; Q2 giftMaking, Q3 partyJudge).
 *
 * CONTRACT (the #1 correctness gate): the answer VALUE is a JSON string with the
 * EXACT keys `mostId` and `leastId`, each a DB `QuestionOption.id`:
 *   {"mostId":"<id>","leastId":"<id>"}
 * This is what `lib/scoring.ts` parseMostLeast reads. It is written ONLY when both
 * are set; an incomplete pick writes '' so the form's required-validation blocks it.
 *
 * Controlled by `value` (parsed each render), so resume rehydrates from the stored
 * JSON. Colors are design tokens (no hex).
 */

import type { CSSProperties } from 'react';

export interface MostLeastOption {
  id: string;
  label: string;
  order: number;
}

function parseValue(value: string): { mostId: string | null; leastId: string | null } {
  if (!value) return { mostId: null, leastId: null };
  try {
    const o = JSON.parse(value) as { mostId?: unknown; leastId?: unknown };
    return {
      mostId: typeof o.mostId === 'string' ? o.mostId : null,
      leastId: typeof o.leastId === 'string' ? o.leastId : null,
    };
  } catch {
    return { mostId: null, leastId: null };
  }
}

export default function InARoomMostLeast({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: MostLeastOption[];
  value: string;
  onChange: (serialized: string) => void;
  ariaLabel: string;
}) {
  const { mostId, leastId } = parseValue(value);

  function commit(nextMost: string | null, nextLeast: string | null) {
    // Only a complete most+least is a valid answer; otherwise clear it so the
    // required-validation treats the question as unanswered.
    onChange(nextMost && nextLeast ? JSON.stringify({ mostId: nextMost, leastId: nextLeast }) : '');
  }

  function pickMost(id: string) {
    const nextMost = mostId === id ? null : id; // toggle off if re-tapped
    const nextLeast = leastId === id ? null : leastId; // most and least can't be the same row
    commit(nextMost, nextLeast);
  }

  function pickLeast(id: string) {
    const nextLeast = leastId === id ? null : id;
    const nextMost = mostId === id ? null : mostId;
    commit(nextMost, nextLeast);
  }

  return (
    <div role="group" aria-label={ariaLabel}>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
        Pick the one that&rsquo;s <strong>most</strong> you and the one that&rsquo;s{' '}
        <strong>least</strong>.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {options.map((o) => {
          const isMost = mostId === o.id;
          const isLeast = leastId === o.id;
          return (
            <div
              key={o.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                padding: '10px 14px',
                borderRadius: 10,
                border: isMost
                  ? '2px solid var(--primary)'
                  : isLeast
                    ? '1px solid var(--border)'
                    : '1px solid var(--border)',
                background: isMost ? 'var(--primary-soft)' : 'var(--bg)',
                color: 'var(--text-primary)',
                opacity: isLeast ? 0.6 : 1,
                transition: 'border-color 120ms ease, background-color 120ms ease, opacity 120ms ease',
              }}
            >
              <span style={{ flex: '1 1 160px', fontSize: 15, lineHeight: 1.35 }}>{o.label}</span>
              <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                <button
                  type="button"
                  aria-pressed={isMost}
                  aria-label={`Mark "${o.label}" as most you`}
                  onClick={() => pickMost(o.id)}
                  style={pillStyle(isMost, 'most')}
                >
                  Most
                </button>
                <button
                  type="button"
                  aria-pressed={isLeast}
                  aria-label={`Mark "${o.label}" as least you`}
                  onClick={() => pickLeast(o.id)}
                  style={pillStyle(isLeast, 'least')}
                >
                  Least
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function pillStyle(active: boolean, kind: 'most' | 'least'): CSSProperties {
  const base: CSSProperties = {
    minHeight: 40,
    minWidth: 64,
    padding: '8px 14px',
    borderRadius: 999,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.02em',
    transition: 'all 120ms ease',
  };
  if (kind === 'most') {
    return active
      ? { ...base, border: '1px solid var(--primary)', background: 'var(--primary)', color: 'var(--bg)' }
      : { ...base, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)' };
  }
  // least
  return active
    ? { ...base, border: '1px solid var(--text-tertiary)', background: 'var(--text-tertiary)', color: 'var(--bg)' }
    : { ...base, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)' };
}
