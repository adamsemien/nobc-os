/**
 * Archetype → influence-tier mapping for Sponsor Intelligence.
 *
 * The six shipped membership archetypes (config/archetypes.ts — LOCKED, never edited)
 * are mapped to the five sponsor-facing influence tiers. This is a derived lookup that
 * READS config/archetypes.ts; it does not modify it. Rationale traces to each
 * archetype's own `tags`:
 *   Patron    (investor / door-opener / long-game)        → Founder
 *   Builder   (founder / builder / operator / ship-it)     → Operator
 *   Maker     (creative / artist / craftsperson)           → Creator
 *   Curator   (tastemaker / cultural-capital / editorial)  → Tastemaker
 *   Connector (network / matchmaker / social-capital)      → Connector
 *   Host      (space-maker / community-anchor)             → Connector  (folded)
 *
 * FLAGGED for Adam: Host has no clean fifth-tier slot, so it folds into Connector.
 * Alternative under consideration: surface Host as its own line. Confirm the mapping
 * before it hardens into sponsor-facing language.
 */
import type { ArchetypeName } from '@/config/archetypes';

export type InfluenceTier = 'Founder' | 'Operator' | 'Tastemaker' | 'Creator' | 'Connector';
export type InfluenceBucket = InfluenceTier | 'Unsegmented';

export const ARCHETYPE_TO_INFLUENCE_TIER: Record<ArchetypeName, InfluenceTier> = {
  Patron: 'Founder',
  Builder: 'Operator',
  Sage: 'Tastemaker',
  Spark: 'Creator',
  Connector: 'Connector',
  Host: 'Connector',
};

/** Display order, highest-influence first. */
export const INFLUENCE_TIER_ORDER: InfluenceTier[] = [
  'Founder',
  'Operator',
  'Tastemaker',
  'Creator',
  'Connector',
];

/** Display label + plain-English blurb + weight for the aggregate influence score (0–100). */
export const INFLUENCE_TIER_META: Record<
  InfluenceBucket,
  { label: string; blurb: string; weight: number }
> = {
  Founder: { label: 'Founders & Capital', blurb: 'founders, investors, and the people who decide what gets built', weight: 100 },
  Operator: { label: 'Operators', blurb: 'the builders and senior executives who ship and run things', weight: 82 },
  Tastemaker: { label: 'Tastemakers', blurb: 'the curators whose recommendation actually moves people', weight: 76 },
  Creator: { label: 'Creators', blurb: 'the makers who set the aesthetic and cultural tone of the room', weight: 68 },
  Connector: { label: 'Connectors & Hosts', blurb: 'the relationship-builders who knit the room together', weight: 72 },
  Unsegmented: { label: 'Unsegmented', blurb: 'attendees without a profile on file', weight: 40 },
};

/** Influence tiers that count as "qualified executive" for the value-vs-fee math. */
export const QUALIFIED_EXEC_TIERS: InfluenceTier[] = ['Founder', 'Operator'];

/** Map an Application.archetype string (nullable) to an influence bucket. */
export function archetypeToBucket(archetype: string | null | undefined): InfluenceBucket {
  if (!archetype) return 'Unsegmented';
  return ARCHETYPE_TO_INFLUENCE_TIER[archetype as ArchetypeName] ?? 'Unsegmented';
}
