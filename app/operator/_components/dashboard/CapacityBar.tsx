'use client';

import { useEffect, useState } from 'react';

/**
 * Hairline capacity indicator — a 3px track with a `--primary` fill that grows
 * from 0 to its target width on mount. Under prefers-reduced-motion it renders
 * at final width with no transition.
 *
 * The label row reads "N / cap confirmed" (or just "N confirmed" when capacity
 * is unknown); `rightLabel` is an optional secondary tag on the right.
 */
export function CapacityBar({
  confirmed,
  capacity,
  rightLabel,
}: {
  confirmed: number;
  capacity: number | null | undefined;
  rightLabel?: string;
}) {
  const target =
    capacity != null && capacity > 0
      ? Math.min(100, Math.round((confirmed / capacity) * 100))
      : 0;

  const [width, setWidth] = useState(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setWidth(target);
      return;
    }
    setAnimate(true);
    const id = requestAnimationFrame(() => setWidth(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  return (
    <div className="w-full">
      <div
        className="h-[3px] w-full overflow-hidden rounded-full"
        style={{ background: 'var(--border)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: 'var(--primary)',
            transition: animate ? 'width 1.1s cubic-bezier(0.2,0.7,0.2,1)' : 'none',
          }}
        />
      </div>
      <div
        className="mt-[7px] flex justify-between text-[11.5px]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <span>
          {capacity != null
            ? `${confirmed} / ${capacity} confirmed`
            : `${confirmed} confirmed`}
        </span>
        {rightLabel ? <span>{rightLabel}</span> : null}
      </div>
    </div>
  );
}
