'use client';

/**
 * tap-grid — single-select, six large tap targets, no typing (Apply Scoring v2,
 * Phase 4; Q1 roomPosition, Q4 perfectFriday, Q5 skipFriday, Q6 bestSelf).
 *
 * CONTRACT: the answer VALUE is the selected option's DB `QuestionOption.id` as a
 * bare string — nothing else. The Phase-3 tally looks that id up directly.
 *
 * Accessible radiogroup: roving tabindex, arrow-key navigation, aria-checked.
 * Colors are design tokens (no hex); layout is mobile-first via auto-fit grid.
 */
import { useRef } from 'react';

export interface TapOption {
  id: string;
  label: string;
  order: number;
}

export default function InARoomTapGrid({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: TapOption[];
  value: string;
  onChange: (optionId: string) => void;
  ariaLabel: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIdx = options.findIndex((o) => o.id === value);
  const focusIdx = selectedIdx >= 0 ? selectedIdx : 0;

  function move(delta: number, from: number) {
    if (options.length === 0) return;
    const next = (from + delta + options.length) % options.length;
    refs.current[next]?.focus();
    onChange(options[next].id); // radiogroup: moving focus moves the selection
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 12,
      }}
    >
      {options.map((o, idx) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={idx === focusIdx ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                e.preventDefault();
                move(1, idx);
              } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                e.preventDefault();
                move(-1, idx);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minHeight: 64,
              padding: '14px 16px',
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: 10,
              border: selected ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: selected ? 'var(--primary-soft)' : 'var(--bg)',
              color: 'var(--text-primary)',
              font: 'inherit',
              fontSize: 15,
              lineHeight: 1.35,
              transition: 'border-color 120ms ease, background-color 120ms ease',
            }}
          >
            <span
              aria-hidden
              style={{
                flex: '0 0 auto',
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: selected ? '5px solid var(--primary)' : '2px solid var(--border)',
                background: 'var(--bg)',
                transition: 'border 120ms ease',
              }}
            />
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
