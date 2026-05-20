import type { ReactNode } from 'react';

/**
 * Editorial section heading. Two variants:
 *  - `eyebrow` (default): tracked-wide uppercase label in tertiary text
 *  - `display`: larger heading set in `var(--font-display)` for major editorial sections
 *
 * `action` is a right-aligned slot for "All events →" style links.
 */
export function SectionHeader({
  title,
  action,
  as = 'eyebrow',
}: {
  title: string;
  action?: ReactNode;
  as?: 'eyebrow' | 'display';
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      {as === 'display' ? (
        <h2
          className="text-2xl leading-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h2>
      ) : (
        <h2
          className="text-[10px] font-medium uppercase tracking-[0.22em]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {title}
        </h2>
      )}
      {action}
    </div>
  );
}
