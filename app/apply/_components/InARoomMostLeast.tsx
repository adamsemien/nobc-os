'use client';

/**
 * most-least — one list of six; pick exactly one MOST and one LEAST, mutually
 * exclusive (Apply Scoring v2, Phase 4; Q2 giftMaking, Q3 partyJudge).
 *
 * CONTRACT (the #1 correctness gate): the answer VALUE pushed to the parent is a
 * JSON string with the EXACT keys `mostId` and `leastId`, each a DB
 * `QuestionOption.id`:
 *   {"mostId":"<id>","leastId":"<id>"}
 * This is what `lib/scoring.ts` parseMostLeast reads. It is written up to the
 * parent ONLY when BOTH are set; an incomplete pick writes '' so the form's
 * required-validation blocks it.
 *
 * Because the parent answer stays '' until complete, a partial pick (most-only or
 * least-only) cannot round-trip through the controlled `value` — it would be
 * discarded on the next render. So the in-progress selection lives in LOCAL state
 * (seeded from `value`), which is the render source; only a complete
 * {mostId,leastId} (else '') is pushed to `onChange`. A useEffect rehydrates from
 * `value` ONLY when it is a COMPLETE answer (draft/resume) — never on ''/partial,
 * so the partial-commit round-trip can't wipe an in-progress pick. Colors are
 * design tokens (no hex).
 */

import { useEffect, useState, type CSSProperties } from 'react';

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
  // In-progress selection lives here (not in the round-tripped `value`), so a
  // single pick renders selected immediately even though the parent answer stays
  // '' until both are set.
  const [sel, setSel] = useState(() => parseValue(value));

  // Rehydrate from a COMPLETE persisted answer (draft/resume). Never sync from
  // ''/partial: every incomplete pick sets the parent to '' , and syncing that
  // back would wipe the in-progress selection. Only a both-set value updates us.
  useEffect(() => {
    const parsed = parseValue(value);
    if (parsed.mostId && parsed.leastId) setSel(parsed);
  }, [value]);

  const { mostId, leastId } = sel;

  function apply(nextMost: string | null, nextLeast: string | null) {
    setSel({ mostId: nextMost, leastId: nextLeast });
    // Only a complete most+least is a valid answer; otherwise clear it so the
    // required-validation treats the question as unanswered.
    onChange(nextMost && nextLeast ? JSON.stringify({ mostId: nextMost, leastId: nextLeast }) : '');
  }

  function pickMost(id: string) {
    const nextMost = mostId === id ? null : id; // toggle off if re-tapped
    const nextLeast = leastId === id ? null : leastId; // most and least can't be the same row
    apply(nextMost, nextLeast);
  }

  function pickLeast(id: string) {
    const nextLeast = leastId === id ? null : id;
    const nextMost = mostId === id ? null : mostId;
    apply(nextMost, nextLeast);
  }

  return (
    <div role="group" aria-label={ariaLabel}>
      <div style={{ display: 'grid', gap: 10 }}>
        {options.map((o) => {
          const isMost = mostId === o.id;
          const isLeast = leastId === o.id;
          const selected = isMost || isLeast;
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
                // Both Most- and Least-selected rows use the tap grid's selected
                // treatment (2px NBC red + soft fill); the lit pill says which.
                border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: selected ? 'var(--primary-soft)' : 'var(--bg)',
                color: 'var(--text-primary)',
                transition: 'border-color 120ms ease, background-color 120ms ease',
              }}
            >
              <span style={{ flex: '1 1 160px', fontSize: 15, lineHeight: 1.35 }}>{o.label}</span>
              <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                <button
                  type="button"
                  aria-pressed={isMost}
                  aria-label={`Mark "${o.label}" as most you`}
                  onClick={() => pickMost(o.id)}
                  style={pillStyle(isMost)}
                >
                  Most
                </button>
                <button
                  type="button"
                  aria-pressed={isLeast}
                  aria-label={`Mark "${o.label}" as least you`}
                  onClick={() => pickLeast(o.id)}
                  style={pillStyle(isLeast)}
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

// Both Most and Least active pills fill NBC red — matching the tap grid's
// selected treatment. Which is which is carried by the pill label, not colour.
function pillStyle(active: boolean): CSSProperties {
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
  return active
    ? { ...base, border: '1px solid var(--primary)', background: 'var(--primary)', color: 'var(--bg)' }
    : { ...base, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)' };
}
