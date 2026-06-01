/**
 * Equivalent Media Value (EMV) — three defensible tiers for what a sponsorship was worth.
 *
 * Parameterized by attendeeCount, qualifiedMix (Founder+Operator share), and totalReach
 * (operator-entered owned+earned impressions). Anchors, all documented in the recap footnotes:
 *   - $2,500 per qualified executive lead
 *   - $300–$700 per-attendee executive-dinner parity (floor/mid/ceiling)
 *   - LinkedIn $31 median CPM, ~$62 ceiling (55–70 midpoint) for the impression layer
 *   - Tribeza ~$114 CPM as optional Austin-local context (aggressive tier)
 *
 * Rule (per spec): if the qualified-executive mix is below 60%, the headline (Typical) tier
 * downshifts off the per-lead method onto the per-attendee dinner-parity floor and says so.
 * All money is in cents to match the codebase money-as-cents convention.
 */
import type { MediaValueResult, MediaValueTier } from './recap-types';

const LEAD_USD = 2500;
const DINNER_LOW_USD = 300;
const DINNER_MID_USD = 500;
const DINNER_HIGH_USD = 700;
const CPM_LINKEDIN_MED = 31;
const CPM_LINKEDIN_CEIL = 62; // midpoint of the $55–$70 ceiling band
const CPM_TRIBEZA = 114;
const QUALIFIED_THRESHOLD = 0.6;

const usdToCents = (usd: number): number => Math.round(usd * 100);
const impressionCents = (reach: number, cpm: number): number => Math.round((reach * cpm * 100) / 1000);

export interface MediaValueParams {
  attendeeCount: number; // people actually reached in person (checked-in)
  qualifiedMix: number; // 0..1 Founder+Operator share of attendees
  totalReach: number; // owned + earned impressions (operator-entered)
  rightsFeeCents?: number | null;
}

export function computeEquivalentMediaValue(p: MediaValueParams): MediaValueResult {
  const N = Math.max(0, Math.round(p.attendeeCount));
  const q = Math.min(1, Math.max(0, p.qualifiedMix));
  const QL = Math.round(N * q);
  const R = Math.max(0, Math.round(p.totalReach));
  const downshifted = q < QUALIFIED_THRESHOLD;

  // Conservative: the whole room at the dinner-parity floor; impressions at LinkedIn's median CPM.
  const consAud = usdToCents(N * DINNER_LOW_USD);
  const consImp = impressionCents(R, CPM_LINKEDIN_MED);
  const conservative: MediaValueTier = {
    tier: 'conservative',
    label: 'Conservative',
    audienceValueCents: consAud,
    impressionValueCents: consImp,
    totalCents: consAud + consImp,
    cpmUsed: CPM_LINKEDIN_MED,
    perAttendedCents: N ? Math.round((consAud + consImp) / N) : 0,
    methodology: `Audience valued at the executive-dinner-parity floor ($${DINNER_LOW_USD}/attendee × ${N}); ${R.toLocaleString()} owned + earned impressions at LinkedIn's $${CPM_LINKEDIN_MED} median CPM. No per-lead value claimed.`,
  };

  // Typical (headline): qualified attendees at lead value, the rest at the dinner floor;
  // impressions at LinkedIn's ceiling CPM. Below the 60% exec threshold, the headline
  // downshifts onto whole-room dinner parity instead of per-lead value.
  let typAud: number;
  let typMethod: string;
  if (!downshifted) {
    typAud = usdToCents(QL * LEAD_USD + (N - QL) * DINNER_LOW_USD);
    typMethod = `${QL} qualified executive leads at $${LEAD_USD.toLocaleString()}/lead + ${N - QL} further attendees at dinner parity ($${DINNER_LOW_USD}); ${R.toLocaleString()} impressions at LinkedIn's $${CPM_LINKEDIN_CEIL} ceiling CPM.`;
  } else {
    typAud = usdToCents(N * DINNER_MID_USD);
    typMethod = `Qualified-executive mix (${Math.round(q * 100)}%) is below the 60% threshold for per-lead valuation, so the room is valued at executive-dinner parity ($${DINNER_MID_USD}/attendee × ${N}) rather than $${LEAD_USD.toLocaleString()}/lead; ${R.toLocaleString()} impressions at LinkedIn's $${CPM_LINKEDIN_CEIL} ceiling CPM.`;
  }
  const typImp = impressionCents(R, CPM_LINKEDIN_CEIL);
  const typical: MediaValueTier = {
    tier: 'typical',
    label: 'Typical',
    audienceValueCents: typAud,
    impressionValueCents: typImp,
    totalCents: typAud + typImp,
    cpmUsed: CPM_LINKEDIN_CEIL,
    perAttendedCents: N ? Math.round((typAud + typImp) / N) : 0,
    methodology: typMethod,
  };

  // Aggressive: qualified at lead value, the rest at the dinner ceiling; impressions at the
  // Austin-local Tribeza CPM.
  const aggAud = usdToCents(QL * LEAD_USD + (N - QL) * DINNER_HIGH_USD);
  const aggImp = impressionCents(R, CPM_TRIBEZA);
  const aggressive: MediaValueTier = {
    tier: 'aggressive',
    label: 'Aggressive',
    audienceValueCents: aggAud,
    impressionValueCents: aggImp,
    totalCents: aggAud + aggImp,
    cpmUsed: CPM_TRIBEZA,
    perAttendedCents: N ? Math.round((aggAud + aggImp) / N) : 0,
    methodology: `${QL} qualified executive leads at $${LEAD_USD.toLocaleString()}/lead + ${N - QL} attendees at the $${DINNER_HIGH_USD} dinner-parity ceiling; ${R.toLocaleString()} impressions at Tribeza's ~$${CPM_TRIBEZA} Austin-local CPM.`,
  };

  const rightsFeeCents = p.rightsFeeCents ?? null;
  const valueVsFeeMultiple =
    rightsFeeCents && rightsFeeCents > 0
      ? Math.round((typical.totalCents / rightsFeeCents) * 10) / 10
      : null;

  return {
    tiers: [conservative, typical, aggressive],
    headline: typical,
    inputs: { attendeeCount: N, qualifiedMix: q, qualifiedLeads: QL, totalReach: R },
    downshifted,
    valueVsFeeMultiple,
    rightsFeeCents,
  };
}
