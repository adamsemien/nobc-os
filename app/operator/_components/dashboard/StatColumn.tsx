import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Editorial stat column — eyebrow label, oversized display numeral, soft CTA.
 *
 * - Numeral renders in `var(--font-display)` so it inherits each theme's display pairing.
 * - When `accent` is true the numeral flips to `var(--primary)`; this is the only
 *   place on the operator home where brand red appears in body content.
 * - `className` slot exists so the parent grid can add vertical hairlines between
 *   columns (`md:border-l`) without the component needing to know its position.
 */
export function StatColumn({
  label,
  value,
  href,
  actionLabel = 'View',
  accent = false,
  className,
}: {
  label: string;
  value: number;
  href: string;
  actionLabel?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-6 px-5 py-8 transition-colors hover:bg-surface md:px-8 md:py-10 ${className ?? ''}`}
      style={{ borderColor: 'var(--border)' }}
    >
      <div
        className="text-[10px] font-medium uppercase tracking-[0.22em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </div>
      <div
        className="text-6xl leading-none tabular-nums md:text-7xl"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          color: accent ? 'var(--primary)' : 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      <div
        className="mt-auto flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] opacity-60 transition-opacity group-hover:opacity-100"
        style={{ color: 'var(--primary)' }}
      >
        {actionLabel}
        <ArrowRight className="h-3 w-3" aria-hidden />
      </div>
    </Link>
  );
}
