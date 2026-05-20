'use client';

import { useCounts } from './CountsProvider';

type Path =
  | 'applications.pending'
  | 'applications.hold'
  | 'applications.approved'
  | 'applications.rejected'
  | 'applications.waitlisted'
  | 'members.total'
  | 'members.charter'
  | 'members.standard'
  | 'members.waitlist'
  | 'events.upcoming'
  | 'events.todayCount'
  | 'events.past'
  | 'rsvps.todayCount'
  | 'rsvps.confirmedNext7d';

/**
 * Single source of truth display. Reads from CountsProvider with an
 * SSR-provided fallback so the badge is correct on first paint and stays
 * in sync as the provider polls or refreshes after mutations.
 */
export function LiveCount({
  path,
  fallback,
  className,
  format = (n: number) => n.toLocaleString(),
}: {
  path: Path;
  fallback: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const { counts } = useCounts();
  const [section, key] = path.split('.') as [
    keyof NonNullable<typeof counts>,
    string,
  ];
  let value: number = fallback;
  if (counts) {
    const obj = counts[section] as Record<string, number>;
    if (obj && typeof obj[key] === 'number') value = obj[key];
  }
  return <span className={className}>{format(value)}</span>;
}
