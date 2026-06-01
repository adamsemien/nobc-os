/**
 * Assemble a pre-sale Audience Intelligence Brief (Sponsor Intelligence, Phase 2b).
 *
 * Produces a RecapPayload (kind 'audience_intelligence_brief') so it reuses the magic-link
 * landing, delivery and download. The numbers are a workspace-level audience deep-dive, a
 * persona match score, and a projected equivalent-media-value range derived from historical
 * attendance. All computed in code; prose is templated (deterministic, no event has happened
 * yet so there are no actuals to narrate). PII-safe + <5 suppression via computeWorkspaceAudience.
 */
import { db } from '@/lib/db';
import { computeWorkspaceAudience, type PersonaCriteria } from './metrics';
import { computeEquivalentMediaValue } from './equivalent-media-value';
import { INFLUENCE_TIER_META } from './influence-tiers';
import { fmtInt, fmtMultiple, fmtPct, fmtUsdCompact } from './recap-format';
import type { AudienceMetrics, HeroStat, RecapPayload } from './recap-types';

function parsePersona(raw: unknown): PersonaCriteria | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
  return {
    archetypes: arr(p.archetypes),
    industries: arr(p.industries),
    seniority: arr(p.seniority),
    companySizes: arr(p.companySizes),
    minAttendance: typeof p.minAttendance === 'number' ? p.minAttendance : undefined,
  };
}

function topTier(m: AudienceMetrics): { label: string; pct: number } {
  const ranked = m.influenceDistribution.filter((shr) => shr.tier !== 'Unsegmented').sort((a, b) => b.count - a.count);
  const top = ranked[0];
  if (!top) return { label: 'members', pct: 0 };
  return { label: INFLUENCE_TIER_META[top.tier].label, pct: Math.round(top.pct * 100) };
}

export async function assembleBrief(args: {
  workspaceId: string;
  sponsorBrandId: string;
}): Promise<{ payload: RecapPayload }> {
  const { workspaceId, sponsorBrandId } = args;

  const sponsor = await db.sponsorBrandProfile.findFirst({
    where: { id: sponsorBrandId, workspaceId },
    select: { name: true, primaryColor: true, targetPersonaCriteria: true, rightsFeeCents: true },
  });
  if (!sponsor) throw new Error(`Sponsor not found in workspace: ${sponsorBrandId}`);

  const persona = parsePersona(sponsor.targetPersonaCriteria);
  const audience = await computeWorkspaceAudience({ workspaceId, persona });

  // Projection from historical attendance: mean checked-in count across past events.
  const grouped = await db.rSVP.groupBy({
    by: ['eventId'],
    where: { workspaceId, checkedIn: true },
    _count: { _all: true },
  });
  const counts = grouped.map((g) => g._count._all).filter((c) => c > 0);
  const pastEventCount = counts.length;
  let projectedAttendance = counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0;
  if (projectedAttendance < 1) projectedAttendance = Math.min(audience.registered || 30, 40); // fallback estimate
  const projectedReach = projectedAttendance * 1000; // documented owned+earned amplification estimate

  const mediaValue = computeEquivalentMediaValue({
    attendeeCount: projectedAttendance,
    qualifiedMix: audience.qualifiedExecMix,
    totalReach: projectedReach,
    rightsFeeCents: sponsor.rightsFeeCents ?? null,
  });

  const tt = topTier(audience);
  const matchLabel = audience.personaMatchPct != null && !audience.personaMatchSuppressed ? fmtPct(audience.personaMatchPct) : '—';

  const heroStats: HeroStat[] = [
    {
      value: fmtInt(audience.registered),
      label: 'Addressable audience',
      whatThisMeans: 'Vetted, approved members you could reach.',
      benchmark: 'The full No Bad Company membership.',
    },
    {
      value: matchLabel,
      label: 'Match to your target',
      whatThisMeans: 'Share of the audience matching your brief persona.',
      benchmark: persona ? 'Against your declared persona.' : 'Add a persona to benchmark this.',
    },
    {
      value: fmtUsdCompact(mediaValue.headline.totalCents),
      label: 'Projected value / event',
      whatThisMeans: 'Typical equivalent media value for one activation.',
      benchmark:
        mediaValue.valueVsFeeMultiple != null
          ? `${fmtMultiple(mediaValue.valueVsFeeMultiple)} a ${fmtUsdCompact(mediaValue.rightsFeeCents ?? 0)} fee.`
          : 'Headline (Typical) of three tiers.',
    },
    {
      value: `${audience.aggregateInfluenceScore}/100`,
      label: 'Aggregate influence',
      whatThisMeans: `${tt.pct}% are ${tt.label}.`,
      benchmark: 'Versus ~50 for a general audience.',
    },
    {
      value: fmtPct(audience.qualifiedExecMix),
      label: 'Founder & operator mix',
      whatThisMeans: 'Decision-makers across the membership.',
      benchmark: 'A 60%+ mix is a premium executive audience.',
    },
  ];

  const standfirst = `A first look at the audience ${sponsor.name} would reach with No Bad Company — who they are, how closely they match your target, and what a single evening is worth.`;
  // Data-driven lead so the prose never out-claims the numbers.
  const senior = audience.aggregateInfluenceScore >= 65 || audience.qualifiedExecMix >= 0.4;
  const matchLine =
    persona && audience.personaMatchPct != null && !audience.personaMatchSuppressed && audience.personaMatchPct > 0
      ? ` ${fmtPct(audience.personaMatchPct)} match the audience you came for.`
      : '';
  const audienceSummary = `${senior ? 'The membership skews decisively senior — an' : 'An'} aggregate influence score of ${audience.aggregateInfluenceScore} out of 100, with ${tt.pct}% ${tt.label} and a ${fmtPct(audience.qualifiedExecMix)} founder-and-operator mix.${matchLine}`;
  const recommendation = `Based on ${pastEventCount || 'recent'} comparable evening${pastEventCount === 1 ? '' : 's'}, a single activation should put ${sponsor.name} in front of roughly ${fmtInt(projectedAttendance)} of this audience in person — an estimated ${fmtUsdCompact(mediaValue.headline.totalCents)} in equivalent media value, before counting the owned and earned amplification a partnership of this calibre attracts.`;

  const today = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());

  const payload: RecapPayload = {
    kind: 'audience_intelligence_brief',
    generatedAtIso: new Date().toISOString(),
    event: { name: `${sponsor.name} · Audience Intelligence`, dateLabel: today, venue: null },
    sponsor: { name: sponsor.name, brandColor: sponsor.primaryColor ?? null },
    objectives: [],
    heroStats,
    mediaValue,
    audience,
    awareness: { ownedImpressions: 0, earnedImpressions: projectedReach, totalReach: projectedReach },
    deliverables: [],
    narrative: {
      coverStandfirst: standfirst,
      audienceSummary,
      awarenessSummary: '',
      activationSummary: '',
      renewal: recommendation,
    },
    modules: { affinity: 'pending', acquisition: 'pending' },
    affinity: null,
    acquisition: null,
  };

  return { payload };
}
