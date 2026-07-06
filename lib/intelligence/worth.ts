/** Member-worth derivation — shared by intelligence metrics.
 *  Worth (0-30) is derived from the archetype scores, matching the
 *  convention used in the operator applications queue. Reads BOTH the current
 *  six-archetype cast (Sage/Spark) and the retired cast (Curator/Maker) so
 *  legacy scored rows keep their exact worth. A given row only ever carries one
 *  cast's keys - the other reads as 0 via g() - so the 0-30 scale is preserved. */
import type { TierKey } from './types';
import { CHARTER_WORTH_THRESHOLD, STANDARD_WORTH_THRESHOLD } from './types';

export function worthTotal(scores: unknown): number {
  if (!scores || typeof scores !== 'object') return 0;
  const s = scores as Record<string, unknown>;
  const g = (k: string) => Math.min(100, Math.max(0, Number(s[k]) || 0));
  return (
    Math.round((g('Connector') + g('Curator') + g('Sage')) / 20) +
    Math.round((g('Builder') + g('Maker') + g('Spark')) / 20) +
    Math.round((g('Host') + g('Patron')) / 20)
  );
}

export function worthTier(total: number): TierKey {
  if (total >= CHARTER_WORTH_THRESHOLD) return 'charter';
  if (total >= STANDARD_WORTH_THRESHOLD) return 'standard';
  return 'waitlist';
}

export const ARCHETYPE_COLORS: Record<string, string> = {
  Connector: 'var(--archetype-connector)',
  Host: 'var(--archetype-host)',
  Curator: 'var(--archetype-curator)',
  Builder: 'var(--archetype-builder)',
  Maker: 'var(--archetype-maker)',
  Patron: 'var(--archetype-patron)',
  Sage: 'var(--archetype-sage)',
  Spark: 'var(--archetype-spark)',
};
