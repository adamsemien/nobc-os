/**
 * Shared types for the Sponsor Intelligence recap + brief (Sponsor Intelligence layer).
 *
 * Distinct from lib/intelligence/types.ts (the Metric Registry). Every number on a
 * sponsor-facing surface is computed in code (lib/intelligence/*) and travels inside
 * these structures; the model only ever writes prose around them. Nothing here carries
 * member PII — distributions are counts/percentages only, and any breakdown cell below
 * MIN_CELL attendees is flagged `suppressed`.
 */
import type { InfluenceBucket } from './influence-tiers';

export type AccessTierKey = 'Member' | 'Guest' | 'Comp';
export type SponsorObjective = 'Awareness' | 'Affinity' | 'Acquisition' | 'Activation';

export interface TierScanStats {
  tier: AccessTierKey;
  registered: number; // confirmed/held
  attended: number; // checked-in
  scanRate: number; // attended/registered, 0..1
  suppressed: boolean; // attended < MIN_CELL → mask the breakdown
}

export interface InfluenceTierShare {
  tier: InfluenceBucket;
  count: number;
  pct: number; // of attended
  suppressed: boolean; // 0 < count < MIN_CELL
}

export interface DistributionCell {
  label: string;
  count: number;
  pct: number;
  suppressed: boolean; // true for the rolled-up "Other" cell of sub-threshold buckets
}

export interface AudienceMetrics {
  registered: number;
  attended: number;
  overallScanRate: number;
  scanByTier: TierScanStats[];
  influenceDistribution: InfluenceTierShare[];
  aggregateInfluenceScore: number; // 0..100
  qualifiedExecMix: number; // 0..1 (Founder+Operator)/attended
  personaMatchPct: number | null; // null when no persona criteria declared
  personaMatchSuppressed: boolean;
  geoSpread: DistributionCell[];
  senioritySpread: DistributionCell[];
  industrySpread: DistributionCell[];
  unsegmentedPct: number;
}

export interface MediaValueTier {
  tier: 'conservative' | 'typical' | 'aggressive';
  label: string;
  audienceValueCents: number;
  impressionValueCents: number;
  totalCents: number;
  cpmUsed: number; // dollars CPM applied to the impression layer
  perAttendedCents: number;
  methodology: string; // footnote, plain English
}

export interface MediaValueResult {
  tiers: MediaValueTier[];
  headline: MediaValueTier; // == typical
  inputs: { attendeeCount: number; qualifiedMix: number; qualifiedLeads: number; totalReach: number };
  downshifted: boolean; // qualifiedMix < threshold → headline uses the parity floor
  valueVsFeeMultiple: number | null; // headline.total / rightsFee
  rightsFeeCents: number | null;
}

export interface ObjectiveResult {
  objective: SponsorObjective;
  declared: boolean;
  status: 'met' | 'partial' | 'on_track' | 'pending_module' | 'not_declared';
  headline: string; // one-line answer in the sponsor's own framing
  whatThisMeans: string;
  benchmark: string;
}

export interface HeroStat {
  value: string; // already humanized: "73%", "112", "$248k"
  label: string;
  whatThisMeans: string;
  benchmark: string;
}

export interface DeliverableProof {
  label: string;
  status: 'verified' | 'pending';
  imageDataUri?: string; // base64 data URI embedded into the PDF (R2 preview, downscaled)
  note?: string;
}

/** Phase 1 (brand-lift). Optional until the survey module is live for an event. */
export interface BrandLiftSummary {
  sampleSize: number;
  smallSample: boolean; // < ~50 → lean qualitative
  awarenessLiftPct: number | null; // aided/unaided post − pre
  considerationLiftPct: number | null;
  sponsorshipRecallPct: number | null;
  activationNps: number | null;
  conversationQuality: number | null; // 0..100, dinner-scale
  quotes: string[]; // anonymized pull-outs
}

/** Phase 2 (activation loop). Optional until booth capture is live. */
export interface AcquisitionSummary {
  boothInteractions: number;
  interactionRatePct: number | null; // booth interactions / attended
  crmOptIns: number;
  crmOptInRatePct: number | null;
  suppressed: boolean;
}

/** The complete sponsor-facing payload. Stored on GeneratedAsset.payload and rendered to PDF.
 *  Contains NO member PII and NO operator-internal scores (renewal probability lives only in
 *  RecapSnapshot.metrics). */
export interface RecapPayload {
  kind: 'activation_recap' | 'audience_intelligence_brief';
  generatedAtIso: string;
  event: { name: string; dateLabel: string; venue?: string | null; city?: string | null };
  sponsor: { name: string; brandColor?: string | null };
  objectives: ObjectiveResult[];
  heroStats: HeroStat[]; // exactly five
  mediaValue: MediaValueResult;
  audience: AudienceMetrics;
  awareness: { ownedImpressions: number; earnedImpressions: number; totalReach: number };
  deliverables: DeliverableProof[];
  narrative: {
    coverStandfirst: string;
    audienceSummary: string;
    awarenessSummary: string;
    activationSummary: string;
    renewal: string;
  };
  modules: { affinity: 'pending' | 'live'; acquisition: 'pending' | 'live' };
  affinity?: BrandLiftSummary | null;
  acquisition?: AcquisitionSummary | null;
}
