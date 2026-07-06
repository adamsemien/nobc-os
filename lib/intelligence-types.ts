/** Shared types for the Intelligence dashboard. Pure types only — safe to
 *  import from both server aggregation (lib/intelligence.ts) and client/demo
 *  code (lib/demo-data.ts) without pulling in the Prisma client. */

export type ArchetypeName = 'Connector' | 'Host' | 'Builder' | 'Patron' | 'Sage' | 'Spark';
export const ARCHETYPE_NAMES: ArchetypeName[] = ['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark'];

export type WorthBand = 'Charter' | 'Standard' | 'Waitlist';

export type Count = { label: string; count: number };
export type Point = { label: string; value: number };

export type IntelligenceData = {
  totalMembers: number;
  totalApplications: number;
  approvedThisMonth: number;
  archetypeDistribution: { archetype: ArchetypeName; count: number }[];
  worthHistogram: { band: WorthBand; count: number }[];
  topCities: Count[];
  topTags: Count[];
  appsPerWeek: Point[];
  topReferrers: Count[];
  dimensionAverages: { influence: number; contribution: number; activation: number };
  dimensionDelta: { influence: number; contribution: number; activation: number };
  approvalRateTrend: Point[];
  scoreTrend: Point[];
  archetypeMix: { week: string; counts: Record<ArchetypeName, number> }[];
  advocatedCategories: Count[];
};

/** A question's insight metadata plus live aggregate signal for the Insights tab. */
export type QuestionInsight = {
  stableKey: string;
  label: string;
  section: string;
  insightLabel: string;
  insightDescription: string;
  scoringDimension: string | null;
  scoringWeight: number;
  scoringLogic: string;
  archetypeSignals: string[];
  sponsorRelevance: string | null;
  /** Average 0-100 answer-quality contribution (demo: synthetic). */
  avgContribution: number;
  /** AI-summarised pattern across answers (demo: canned). */
  answerPattern: string;
};

/** Plain-English sponsor segment mapping for an archetype. */
export const ARCHETYPE_SPONSOR_SEGMENT: Record<ArchetypeName, string> = {
  Connector: 'Premium travel, members clubs, executive services — people who move others through doors.',
  Host: 'Spirits, F&B, hospitality — people who build the rooms others want to be in.',
  Builder: 'B2B SaaS, fintech, business banking — operators who ship and lead.',
  Patron: 'Wealth management, real estate, premium services — people with capital and access.',
  Sage: 'Books, media, wellness, education - people others come to for perspective and understanding.',
  Spark: 'Nightlife, events, travel, beverage - people who set the energy of a room.',
};
