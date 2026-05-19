import { toScoreDisplay, type TierNames } from '@/lib/score-display';

export function ScoreBadge({
  value,
  size = 'md',
  showTier = true,
  tierNames,
}: {
  value: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showTier?: boolean;
  /** Optional override — falls back to defaults (Resident/Member/Considering). */
  tierNames?: TierNames;
}) {
  const display = toScoreDisplay(value, tierNames);
  if (!display) {
    return (
      <span className="text-sm tabular-nums" style={{ color: 'var(--text-tertiary, var(--text-muted))' }}>
        —
      </span>
    );
  }

  const sizes = {
    sm: { num: 'text-sm', tier: 'text-[10px]', dot: 'text-[10px]' },
    md: { num: 'text-base', tier: 'text-[11px]', dot: 'text-xs' },
    lg: { num: 'text-2xl', tier: 'text-xs', dot: 'text-sm' },
  } as const;
  const sz = sizes[size];

  return (
    <span className="inline-flex items-baseline gap-1.5 leading-none" style={{ color: display.toneVar }}>
      <span className={`font-semibold tabular-nums ${sz.num}`}>{display.score}</span>
      {showTier ? (
        <>
          <span className={`${sz.dot} opacity-50`}>·</span>
          <span className={`uppercase tracking-[0.14em] ${sz.tier}`}>{display.tierLabel}</span>
        </>
      ) : null}
    </span>
  );
}
