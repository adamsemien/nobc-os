'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

/** Compact info tooltip — a small (?) that reveals 1–2 sentences on hover/tap.
 *  Inline-styled to render consistently across themes. */
export function HelpTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label="More info"
        className="inline-flex items-center justify-center rounded-full"
        style={{ color: 'var(--text-tertiary, var(--text-secondary))' }}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-60 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-xs leading-snug shadow-md"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
