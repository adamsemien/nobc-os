'use client';

import { useEffect, useState } from 'react';

/**
 * Masthead live clock — large serif HH·MM with a `--primary` separator, over a
 * small contextual sub line ("doors soon" / "all quiet", passed from the server).
 *
 * Renders a neutral placeholder until mounted so server and client markup match.
 */
export function DeskClock({ sub }: { sub: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hh = now ? String(now.getHours()).padStart(2, '0') : '--';
  const mm = now ? String(now.getMinutes()).padStart(2, '0') : '--';

  return (
    <div className="shrink-0 text-right">
      <div
        className="text-[54px] leading-[0.9] tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
        }}
      >
        {hh}
        <span style={{ color: 'var(--primary)' }}>·</span>
        {mm}
      </div>
      <div
        className="mt-2 text-[11px] uppercase tracking-[0.18em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {sub}
      </div>
    </div>
  );
}
