import { db } from '@/lib/db';
import { registerMetric } from '@/lib/intelligence/registry';
import type { DrillDownRecord, Matrix, Metric, MetricContext, MetricResult } from '@/lib/intelligence/types';
import { worthTotal } from '@/lib/intelligence/worth';
import { CHARTER_WORTH_THRESHOLD } from '@/lib/intelligence/types';
import { SPONSOR_TARGETS, formatPriceBand } from '@/lib/intelligence/sponsor-targets';
import { DEMO_MEMBERS } from '@/lib/intelligence/demo-data';

type CommunityShape = {
  archetypeCounts: Record<string, number>;
  total: number;
  charterShare: number; // 0-100
};

function fitScore(c: CommunityShape, target: (typeof SPONSOR_TARGETS)[number]): number {
  const inTarget = target.targetArchetypes.reduce((s, a) => s + (c.archetypeCounts[a] ?? 0), 0);
  const overlapPct = c.total > 0 ? (inTarget / c.total) * 100 : 0;
  const charterFactor = target.charterWeighted ? c.charterShare : 60;
  return Math.max(0, Math.min(100, Math.round(0.7 * overlapPct + 0.3 * charterFactor)));
}

function gapToClose(c: CommunityShape, target: (typeof SPONSOR_TARGETS)[number], score: number): string {
  const inTarget = target.targetArchetypes.reduce((s, a) => s + (c.archetypeCounts[a] ?? 0), 0);
  const overlapPct = c.total > 0 ? (inTarget / c.total) * 100 : 0;
  if (overlapPct < 40) return `more ${target.primaryArchetype} approvals`;
  if (target.charterWeighted && c.charterShare < 20) return 'more Charter approvals';
  if (score >= 80) return 'audience already strong — pitch now';
  return `deepen the ${target.primaryArchetype} segment`;
}

function buildMatrix(c: CommunityShape): { matrix: Matrix; topName: string; topScore: number; topBand: string } {
  const rows = SPONSOR_TARGETS.map((t) => {
    const score = fitScore(c, t);
    const band = formatPriceBand(t.priceBandLow, t.priceBandHigh);
    const gap = gapToClose(c, t, score);
    return {
      name: t.name,
      score,
      row: {
        label: t.name,
        cells: [
          { key: 'Fit', value: score, bar: score },
          { key: 'Format', value: t.fitFormats[0] },
          { key: 'Band', value: band },
          { key: 'Archetype', value: t.primaryArchetype },
        ],
        note: `${t.name} fit is ${score} — pitch ${t.fitFormats[0]} at ${band}; gap to close is ${gap}.`,
      },
      band,
    };
  }).sort((a, b) => b.score - a.score);

  return {
    matrix: rows.map((r) => r.row),
    topName: rows[0].name,
    topScore: rows[0].score,
    topBand: rows[0].band,
  };
}

async function getCommunity(workspaceId: string, demoMode: boolean): Promise<CommunityShape> {
  if (demoMode) {
    const archetypeCounts: Record<string, number> = {};
    for (const m of DEMO_MEMBERS) archetypeCounts[m.archetype] = (archetypeCounts[m.archetype] ?? 0) + 1;
    const charter = DEMO_MEMBERS.filter((m) => m.worthBand === 'Charter').length;
    return {
      archetypeCounts,
      total: DEMO_MEMBERS.length,
      charterShare: Math.round((charter / DEMO_MEMBERS.length) * 100),
    };
  }
  const apps = await db.application.findMany({
    where: { workspaceId, archetype: { not: null } },
    select: { archetype: true, archetypeScores: true },
  });
  const archetypeCounts: Record<string, number> = {};
  let charter = 0;
  for (const a of apps) {
    if (a.archetype) archetypeCounts[a.archetype] = (archetypeCounts[a.archetype] ?? 0) + 1;
    if (worthTotal(a.archetypeScores) >= CHARTER_WORTH_THRESHOLD) charter++;
  }
  return {
    archetypeCounts,
    total: apps.length,
    charterShare: apps.length > 0 ? Math.round((charter / apps.length) * 100) : 0,
  };
}

async function query(ctx: MetricContext): Promise<MetricResult> {
  const community = await getCommunity(ctx.workspaceId, !!ctx.demoMode);
  const { matrix, topName, topScore, topBand } = buildMatrix(community);
  return {
    value: matrix,
    format: 'number',
    insight: `${topName} is the strongest fit at ${topScore}/100 — pitch in the ${topBand} band.`,
    drillDownAvailable: true,
  };
}

async function drillDown(ctx: MetricContext): Promise<DrillDownRecord[]> {
  const community = await getCommunity(ctx.workspaceId, !!ctx.demoMode);
  return SPONSOR_TARGETS.map((t) => {
    const inTarget = t.targetArchetypes.reduce((s, a) => s + (community.archetypeCounts[a] ?? 0), 0);
    const overlapPct = community.total > 0 ? Math.round((inTarget / community.total) * 100) : 0;
    return {
      sponsor: t.name,
      category: t.category,
      fitScore: fitScore(community, t),
      targetArchetypes: t.targetArchetypes.join(' / '),
      audienceOverlapPct: overlapPct,
      charterSharePct: community.charterShare,
      recommendedFormat: t.fitFormats[0],
      priceBand: formatPriceBand(t.priceBandLow, t.priceBandHigh),
      contact: t.contact ? `${t.contact.name} — ${t.contact.title}` : '',
    };
  }).sort((a, b) => Number(b.fitScore) - Number(a.fitScore));
}

const metric: Metric = {
  id: 'sponsors.sponsor-fit-score',
  name: 'Sponsor Fit Score',
  category: 'sponsors',
  description: 'How well the current member base matches each sponsor target, with a recommended format and price band.',
  businessQuestion: 'For a given sponsor target, how well does our member base match — and what is the realistic price band?',
  resultType: 'matrix',
  viz: 'table',
  query,
  drillDown,
  refresh: 'cached-hourly',
  mcpExposed: true,
};

registerMetric(metric);
export default metric;
