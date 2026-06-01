/**
 * Assemble the Activation Recap payload (and the reproducible internal snapshot).
 *
 * Everything sponsor-facing is computed here in code: objectives, the five hero stats, and
 * the benchmark + "what this means for you" line attached to every number. The model is
 * only invoked (in recap-narrative) to write prose around these numbers. Operator-internal
 * signals (renewal probability) are returned separately and NEVER placed on the payload.
 */
import { db } from '@/lib/db';
import { computeAudienceMetrics, type PersonaCriteria } from './metrics';
import { computeEquivalentMediaValue } from './equivalent-media-value';
import { generateRecapNarrative } from './recap-narrative';
import { resolveDeliverables, autoEventPhotos } from './deliverables';
import { computeBrandLift } from './survey';
import { computeAcquisition } from './activation';
import { INFLUENCE_TIER_META } from './influence-tiers';
import { fmtInt, fmtMultiple, fmtPct, fmtUsdCompact } from './recap-format';
import type {
  AcquisitionSummary,
  AudienceMetrics,
  BrandLiftSummary,
  DeliverableProof,
  HeroStat,
  MediaValueResult,
  ObjectiveResult,
  RecapPayload,
  SponsorObjective,
} from './recap-types';

const OBJECTIVES: SponsorObjective[] = ['Awareness', 'Affinity', 'Acquisition', 'Activation'];

export interface AssembleArgs {
  workspaceId: string;
  eventId: string;
  sponsorBrandId?: string | null;
  ownedImpressions?: number;
  earnedImpressions?: number;
  deliverables?: { label: string; assetId?: string }[];
  /** Phase 1/2 modules pass live summaries; Phase 0 leaves them null (→ "available with module"). */
  affinity?: BrandLiftSummary | null;
  acquisition?: AcquisitionSummary | null;
  kind?: 'activation_recap' | 'audience_intelligence_brief';
}

export interface AssembledRecap {
  payload: RecapPayload;
  snapshotMetrics: Record<string, unknown>; // → RecapSnapshot.metrics (internal, may include private signals)
  mediaValueInputs: Record<string, unknown>; // → RecapSnapshot.mediaValueInputs
}

function dateLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

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

function detectDeclared(text: string | null | undefined): Set<SponsorObjective> {
  const t = (text ?? '').toLowerCase();
  const set = new Set<SponsorObjective>();
  for (const o of OBJECTIVES) if (t.includes(o.toLowerCase())) set.add(o);
  // No objective named (or no brief): a single event always speaks to Awareness + Activation.
  if (set.size === 0) {
    set.add('Awareness');
    set.add('Activation');
  }
  return set;
}

function topTier(m: AudienceMetrics): { label: string; pct: number } {
  const ranked = m.influenceDistribution
    .filter((s) => s.tier !== 'Unsegmented')
    .sort((a, b) => b.count - a.count);
  const top = ranked[0];
  if (!top) return { label: 'guests', pct: 0 };
  return { label: INFLUENCE_TIER_META[top.tier].label, pct: Math.round(top.pct * 100) };
}

function buildObjectives(args: {
  declared: Set<SponsorObjective>;
  m: AudienceMetrics;
  mv: MediaValueResult;
  affinity?: BrandLiftSummary | null;
  acquisition?: AcquisitionSummary | null;
}): ObjectiveResult[] {
  const { declared, m, mv, affinity, acquisition } = args;
  const vMult = mv.valueVsFeeMultiple;

  const awareness: ObjectiveResult = {
    objective: 'Awareness',
    declared: declared.has('Awareness'),
    status: vMult != null ? (vMult >= 1 ? 'met' : 'partial') : m.attended > 0 ? 'on_track' : 'partial',
    headline: `${fmtUsdCompact(mv.headline.totalCents)} in equivalent media value from ${fmtInt(m.attended)} in-person guests${
      mv.inputs.totalReach > 0 ? ` plus ${fmtInt(mv.inputs.totalReach)} owned & earned impressions` : ''
    }.`,
    whatThisMeans: 'This is what it would have cost to buy this much qualified attention through paid media — here you earned it in the room.',
    benchmark:
      vMult != null
        ? `${fmtMultiple(vMult)} your ${fmtUsdCompact(mv.rightsFeeCents ?? 0)} rights fee.`
        : 'Benchmarked against LinkedIn CPMs and executive-dinner parity.',
  };

  const activation: ObjectiveResult = {
    objective: 'Activation',
    declared: declared.has('Activation'),
    status: m.overallScanRate >= 0.7 ? 'met' : m.overallScanRate >= 0.5 ? 'on_track' : 'partial',
    headline: `${fmtPct(m.overallScanRate)} of confirmed guests showed up — ${fmtInt(m.attended)} checked in across Member, Guest and Comp access.`,
    whatThisMeans: 'Turnout is the truest signal of how much your audience actually wanted to be there.',
    benchmark: 'Versus the 40–60% show rate typical of free urban events; above 70% is exceptional.',
  };

  const affinityObj: ObjectiveResult = affinity
    ? {
        objective: 'Affinity',
        declared: declared.has('Affinity'),
        status: (affinity.considerationLiftPct ?? 0) > 0 || (affinity.awarenessLiftPct ?? 0) > 0 ? 'met' : 'on_track',
        headline:
          affinity.awarenessLiftPct != null
            ? `+${affinity.awarenessLiftPct}% awareness lift and +${affinity.considerationLiftPct ?? 0}% consideration lift across ${affinity.sampleSize} responses.`
            : `${affinity.sampleSize} brand-lift responses captured${affinity.smallSample ? ' (small sample — read qualitatively)' : ''}.`,
        whatThisMeans: 'Measures whether the night actually shifted how your audience feels about you.',
        benchmark: 'Pre/post lift against the same audience — the cleanest read of brand impact.',
      }
    : {
        objective: 'Affinity',
        declared: declared.has('Affinity'),
        status: 'pending_module',
        headline: 'Available with the brand-lift module — aided/unaided awareness, preference and consideration lift.',
        whatThisMeans: 'Measures whether the night actually shifted how your audience feels about you.',
        benchmark: 'Unlocked by the pre/post survey pair.',
      };

  const acquisitionObj: ObjectiveResult = acquisition
    ? {
        objective: 'Acquisition',
        declared: declared.has('Acquisition'),
        status: (acquisition.crmOptInRatePct ?? 0) > 0 ? 'met' : 'on_track',
        headline: acquisition.suppressed
          ? 'Booth interactions captured (sample too small to break out).'
          : `${acquisition.crmOptIns} CRM opt-ins from ${acquisition.boothInteractions} booth interactions (${acquisition.crmOptInRatePct ?? 0}% opt-in).`,
        whatThisMeans: 'Measures the pipeline the night put directly into your hands.',
        benchmark: 'Opt-in rate against the room you actually engaged.',
      }
    : {
        objective: 'Acquisition',
        declared: declared.has('Acquisition'),
        status: 'pending_module',
        headline: 'Available with the activation-loop module — booth interaction rate and CRM opt-in capture.',
        whatThisMeans: 'Measures the pipeline the night put directly into your hands.',
        benchmark: 'Unlocked by the at-activation booth form.',
      };

  // Stable order: Awareness, Affinity, Acquisition, Activation
  return [awareness, affinityObj, acquisitionObj, activation];
}

function buildHeroStats(m: AudienceMetrics, mv: MediaValueResult, tt: { label: string; pct: number }): HeroStat[] {
  const stats: HeroStat[] = [
    {
      value: fmtUsdCompact(mv.headline.totalCents),
      label: 'Equivalent media value',
      whatThisMeans: "What this audience's attention would cost to buy through paid channels.",
      benchmark:
        mv.valueVsFeeMultiple != null
          ? `${fmtMultiple(mv.valueVsFeeMultiple)} your rights fee.`
          : 'Headline (Typical) of three tiers.',
    },
    {
      value: fmtInt(m.attended),
      label: 'In the room',
      whatThisMeans: `${fmtPct(m.overallScanRate)} of confirmed guests turned up.`,
      benchmark: 'Versus a 40–60% typical urban-event show rate.',
    },
    {
      value: `${m.aggregateInfluenceScore}/100`,
      label: 'Aggregate influence',
      whatThisMeans: `${tt.pct}% of the room were ${tt.label}.`,
      benchmark: 'Versus ~50 for a general conference badge-scan crowd.',
    },
    {
      value: fmtPct(m.qualifiedExecMix),
      label: 'Founder & operator mix',
      whatThisMeans: 'Decision-makers and capital actually in the room.',
      benchmark: 'A 60%+ mix clears the bar for a premium executive audience.',
    },
    m.personaMatchPct != null
      ? {
          value: m.personaMatchSuppressed ? '—' : fmtPct(m.personaMatchPct),
          label: 'Matched your target persona',
          whatThisMeans: m.personaMatchSuppressed
            ? 'Sample too small to report without risking identification.'
            : 'Share of the room matching the audience you came for.',
          benchmark: 'Against the persona in your Sponsor Brief.',
        }
      : {
          value: fmtPct(tt.pct / 100),
          label: `${tt.label} share`,
          whatThisMeans: 'The single largest influence tier in the room.',
          benchmark: 'Add a target persona to your brief to benchmark this directly.',
        },
  ];
  return stats;
}

function renewalProbability(m: AudienceMetrics, mv: MediaValueResult): number {
  // Operator-internal only. Bounded 0..1. NEVER placed on the sponsor payload.
  let p = 0.4;
  p += 0.25 * Math.min(1, m.overallScanRate);
  p += 0.2 * Math.min(1, m.aggregateInfluenceScore / 100);
  if (mv.valueVsFeeMultiple != null) p += 0.15 * Math.min(1, mv.valueVsFeeMultiple / 3);
  return Math.round(Math.max(0, Math.min(1, p)) * 100) / 100;
}

export async function assembleRecap(args: AssembleArgs): Promise<AssembledRecap> {
  const {
    workspaceId,
    eventId,
    sponsorBrandId,
    ownedImpressions = 0,
    earnedImpressions = 0,
    deliverables,
    kind = 'activation_recap',
  } = args;

  // Affinity (brand-lift) + Acquisition (booth): use an explicitly-passed summary, else
  // auto-compute from submitted survey/activation responses. Null → "available with the module".
  let affinity = args.affinity ?? null;
  let acquisition = args.acquisition ?? null;

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { title: true, startAt: true, location: true },
  });
  if (!event) throw new Error(`Event not found in workspace: ${eventId}`);

  const sponsor = sponsorBrandId
    ? await db.sponsorBrandProfile.findFirst({
        where: { id: sponsorBrandId, workspaceId },
        select: { name: true, primaryColor: true, declaredObjectives: true, targetPersonaCriteria: true, rightsFeeCents: true },
      })
    : null;

  const persona = parsePersona(sponsor?.targetPersonaCriteria);
  const metrics = await computeAudienceMetrics({ workspaceId, eventId, persona });

  const totalReach = Math.max(0, ownedImpressions) + Math.max(0, earnedImpressions);
  const mediaValue = computeEquivalentMediaValue({
    attendeeCount: metrics.attended,
    qualifiedMix: metrics.qualifiedExecMix,
    totalReach,
    rightsFeeCents: sponsor?.rightsFeeCents ?? null,
  });

  if (sponsorBrandId) {
    if (!affinity) affinity = await computeBrandLift({ workspaceId, eventId, sponsorBrandId });
    if (!acquisition) acquisition = await computeAcquisition({ workspaceId, eventId, sponsorBrandId });
  }

  const declared = detectDeclared(sponsor?.declaredObjectives);
  const objectives = buildObjectives({ declared, m: metrics, mv: mediaValue, affinity, acquisition });
  const tt = topTier(metrics);
  const heroStats = buildHeroStats(metrics, mediaValue, tt);

  const proofs: DeliverableProof[] =
    deliverables && deliverables.length
      ? await resolveDeliverables({ workspaceId, declared: deliverables })
      : await autoEventPhotos({ workspaceId, eventId, sponsorName: sponsor?.name ?? null });
  const deliverablesVerified = proofs.filter((p) => p.status === 'verified').length;

  const narrative = await generateRecapNarrative({
    sponsorName: sponsor?.name ?? 'Your brand',
    eventName: event.title,
    dateLabel: dateLabel(event.startAt),
    declaredObjectives: sponsor?.declaredObjectives ?? null,
    attended: metrics.attended,
    registered: metrics.registered,
    overallScanRatePct: Math.round(metrics.overallScanRate * 100),
    aggregateInfluenceScore: metrics.aggregateInfluenceScore,
    topTierLabel: tt.label,
    topTierPct: tt.pct,
    qualifiedExecMixPct: Math.round(metrics.qualifiedExecMix * 100),
    personaMatchPct: metrics.personaMatchPct != null && !metrics.personaMatchSuppressed ? Math.round(metrics.personaMatchPct * 100) : null,
    headlineValueLabel: fmtUsdCompact(mediaValue.headline.totalCents),
    valueVsFeeMultiple: mediaValue.valueVsFeeMultiple,
    deliverablesVerified,
    deliverablesTotal: proofs.length,
  });

  const payload: RecapPayload = {
    kind,
    generatedAtIso: new Date().toISOString(),
    event: { name: event.title, dateLabel: dateLabel(event.startAt), venue: event.location },
    sponsor: { name: sponsor?.name ?? 'Your brand', brandColor: sponsor?.primaryColor ?? null },
    objectives,
    heroStats,
    mediaValue,
    audience: metrics,
    awareness: { ownedImpressions, earnedImpressions, totalReach },
    deliverables: proofs,
    narrative,
    modules: { affinity: affinity ? 'live' : 'pending', acquisition: acquisition ? 'live' : 'pending' },
    affinity,
    acquisition,
  };

  const snapshotMetrics: Record<string, unknown> = {
    audience: metrics,
    objectives,
    heroStats,
    deliverablesVerified,
    deliverablesTotal: proofs.length,
    internal: { renewalProbability: renewalProbability(metrics, mediaValue) }, // operator-only
  };

  return { payload, snapshotMetrics, mediaValueInputs: mediaValue as unknown as Record<string, unknown> };
}
