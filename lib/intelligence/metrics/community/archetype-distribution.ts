import { db } from '@/lib/db';
import { registerMetric } from '@/lib/intelligence/registry';
import type { Breakdown, DrillDownRecord, Metric, MetricContext, MetricResult } from '@/lib/intelligence/types';
import { ARCHETYPE_COLORS } from '@/lib/intelligence/worth';
import { DEMO_MEMBERS } from '@/lib/intelligence/demo-data';

const ARCHETYPES = ['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark'];

const SPONSOR_INDEX: Record<string, string> = {
  Sage: 'a Sage-heavy mix indexes to media, wellness, and education sponsors.',
  Patron: 'a Patron-heavy mix indexes to wealth-management and automotive sponsors.',
  Connector: 'a Connector-heavy mix indexes to card, travel, and members-club sponsors.',
  Host: 'a Host-heavy mix indexes to spirits and hospitality sponsors.',
  Builder: 'a Builder-heavy mix indexes to B2B SaaS and fintech sponsors.',
  Spark: 'a Spark-heavy mix indexes to nightlife, events, and beverage sponsors.',
};

function buildBreakdown(counts: Record<string, number>): Breakdown {
  const total = Object.values(counts).reduce((s, n) => s + n, 0) || 1;
  return ARCHETYPES.filter((a) => (counts[a] ?? 0) > 0).map((a) => ({
    label: a,
    value: counts[a] ?? 0,
    percent: Math.round(((counts[a] ?? 0) / total) * 100),
    color: ARCHETYPE_COLORS[a],
  }));
}

async function countByArchetype(workspaceId: string, from?: Date, to?: Date): Promise<Record<string, number>> {
  const apps = await db.application.findMany({
    where: {
      workspaceId,
      archetype: { not: null },
      ...(from && to ? { createdAt: { gte: from, lte: to } } : {}),
    },
    select: { archetype: true },
  });
  const counts: Record<string, number> = {};
  for (const a of apps) if (a.archetype) counts[a.archetype] = (counts[a.archetype] ?? 0) + 1;
  return counts;
}

async function query(ctx: MetricContext): Promise<MetricResult> {
  if (ctx.demoMode) {
    const counts: Record<string, number> = {};
    for (const m of DEMO_MEMBERS) counts[m.archetype] = (counts[m.archetype] ?? 0) + 1;
    const breakdown = buildBreakdown(counts);
    const top = [...breakdown].sort((a, b) => b.value - a.value)[0];
    return {
      value: breakdown,
      format: 'number',
      insight: `${top.label} leads the community at ${top.percent}% — ${SPONSOR_INDEX[top.label]}`,
      drillDownAvailable: true,
    };
  }

  const { workspaceId, dateRange, comparePeriod } = ctx;
  const counts = await countByArchetype(workspaceId, dateRange?.from, dateRange?.to);
  const breakdown = buildBreakdown(counts);

  let previousValue: Breakdown | undefined;
  if (comparePeriod && dateRange) {
    const span = dateRange.to.getTime() - dateRange.from.getTime();
    const prevTo = comparePeriod === 'year-ago'
      ? new Date(dateRange.from.getTime() - 1)
      : new Date(dateRange.from.getTime() - 1);
    const prevFrom = comparePeriod === 'year-ago'
      ? new Date(dateRange.from.getTime() - 365 * 86400000)
      : new Date(dateRange.from.getTime() - span);
    const prevCounts = await countByArchetype(workspaceId, prevFrom, prevTo);
    previousValue = buildBreakdown(prevCounts);
    const prevByLabel = Object.fromEntries(previousValue.map((p) => [p.label, p.value]));
    for (const item of breakdown) item.delta = item.value - (prevByLabel[item.label] ?? 0);
  }

  const top = [...breakdown].sort((a, b) => b.value - a.value)[0];
  return {
    value: breakdown,
    previousValue,
    format: 'number',
    insight: top
      ? `${top.label} leads the community at ${top.percent}% — ${SPONSOR_INDEX[top.label]}`
      : 'No archetype data yet — scored applications populate this view.',
    drillDownAvailable: true,
  };
}

async function drillDown(ctx: MetricContext): Promise<DrillDownRecord[]> {
  const selected = ctx.filters?.archetype;
  if (ctx.demoMode) {
    return DEMO_MEMBERS.filter((m) => !selected?.length || selected.includes(m.archetype)).map((m) => ({
      member: m.name,
      archetype: m.archetype,
      city: m.city,
      tier: m.worthBand,
    }));
  }
  const apps = await db.application.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      archetype: selected?.length ? { in: selected } : { not: null },
    },
    select: { fullName: true, email: true, archetype: true, city: true, aiScore: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return apps.map((a) => ({
    member: a.fullName,
    email: a.email,
    archetype: a.archetype ?? '',
    city: a.city ?? '',
    score: a.aiScore ?? 0,
  }));
}

const metric: Metric = {
  id: 'community.archetype-distribution',
  name: 'Archetype Distribution',
  category: 'community',
  description: 'The archetype mix of the community, with drift versus the comparison period.',
  businessQuestion: 'What is the archetype composition of our community, and is it drifting? This is the foundational sponsor pitch slide.',
  resultType: 'breakdown',
  viz: 'donut',
  query,
  drillDown,
  refresh: 'cached-hourly',
  mcpExposed: true,
};

registerMetric(metric);
export default metric;
