import type { ReactNode } from 'react';
import { GlassPanel } from './GlassPanel';
import { CountUp } from './CountUp';

/**
 * A figure in the asymmetric stat grid: eyebrow + oversized count-up numeral.
 *
 * Variants control the numeral scale and internal layout:
 *  - `lead`: dominant tall panel (uses `--glass-strong`); pass `accentValue` to
 *    render the numeral in `--primary` — this is the single dominant red moment.
 *    `footer` carries the note + avatar faces + the red "Review the queue" pill.
 *  - `sm`:   compact figure; `footer` carries the small delta line.
 *  - `wide`: numeral on the left, `aside` block (e.g. "Doors haven't opened") on the right.
 */
export function StatFigure({
  variant = 'sm',
  eyebrow,
  value,
  accentValue = false,
  footer,
  aside,
  className,
}: {
  variant?: 'lead' | 'sm' | 'wide';
  eyebrow: string;
  value: number;
  accentValue?: boolean;
  footer?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  const numeralSize =
    variant === 'lead'
      ? 'text-[clamp(5rem,9vw,8.4rem)]'
      : variant === 'wide'
        ? 'text-[clamp(2.8rem,4vw,3.8rem)]'
        : 'text-[clamp(3rem,4.6vw,4.4rem)]';

  const numeral = (
    <>
      <div
        className="text-[13px] font-medium uppercase tracking-[0.18em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {eyebrow}
      </div>
      <CountUp
        value={value}
        className={`${numeralSize} mt-[14px] block leading-[0.86] tabular-nums`}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          letterSpacing: '-0.03em',
          color: accentValue ? 'var(--primary)' : 'var(--text-primary)',
        }}
      />
    </>
  );

  if (variant === 'wide') {
    return (
      <GlassPanel
        className={`flex items-center justify-between gap-6 px-[28px] py-[26px] ${className ?? ''}`}
      >
        <div className="min-w-0">{numeral}</div>
        {aside}
      </GlassPanel>
    );
  }

  return (
    <GlassPanel
      strong={variant === 'lead'}
      className={`flex flex-col px-[28px] py-[26px] ${className ?? ''}`}
    >
      {numeral}
      {footer}
    </GlassPanel>
  );
}
