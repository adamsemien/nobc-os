/**
 * Hairline-style capacity indicator for an event.
 *
 * Renders a small "CONFIRMED  N/cap" header row over a single 1px rule:
 *   - track: `var(--border)`
 *   - fill:  `var(--primary)`
 *
 * No rounded pill, no shadows — a magazine progress mark, not a fintech meter.
 */
export function CapacityBar({
  confirmed,
  capacity,
}: {
  confirmed: number;
  capacity: number | null | undefined;
}) {
  const fillPct =
    capacity != null && capacity > 0
      ? Math.min(100, Math.round((confirmed / capacity) * 100))
      : 0;

  return (
    <div className="w-full">
      <div
        className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.18em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>confirmed</span>
        <span className="text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {confirmed}
          {capacity != null ? (
            <span style={{ color: 'var(--text-tertiary)' }}>/{capacity}</span>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 h-px w-full" style={{ background: 'var(--border)' }}>
        <div
          className="h-full"
          style={{ width: `${fillPct}%`, background: 'var(--primary)' }}
        />
      </div>
    </div>
  );
}
