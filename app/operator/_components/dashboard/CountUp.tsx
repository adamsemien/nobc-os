'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Animated numeral that counts up from 0 to `value` on mount (ease-out cubic).
 *
 * Renders 0 during SSR / pre-hydration, then ramps on the client. Under
 * prefers-reduced-motion the final value is set immediately with no animation.
 * In the editorial (riso) theme the ramp is crisp (900ms) to match print motion.
 */
export function CountUp({
  value,
  durationMs = 1500,
  className,
  style,
}: {
  value: number;
  durationMs?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || value <= 0) {
      setDisplay(value);
      return;
    }
    const editorial = document.documentElement.dataset.theme === 'editorial';
    const dur = editorial ? 900 : durationMs;
    let raf = 0;
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setDisplay(Math.round(ease(p) * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span className={className} style={style}>
      {display}
    </span>
  );
}
