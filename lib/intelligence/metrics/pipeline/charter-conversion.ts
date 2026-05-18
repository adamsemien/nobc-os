import { db } from '@/lib/db';
import { registerMetric } from '@/lib/intelligence/registry';
import type { DrillDownRecord, Metric, MetricContext, MetricResult, TimeSeries } from '@/lib/intelligence/types';
import { worthTotal } from '@/lib/intelligence/worth';
import { CHARTER_WORTH_THRESHOLD } from '@/lib/intelligence/types';
import { DEMO_CHARTER_TREND } from '@/lib/intelligence/demo-data';

function weekLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function charterShare(apps: { archetypeScores: unknown }[]): number {
  if (apps.length === 0) return 0;
  const charter = apps.filter((a) => worthTotal(a.archetypeScores) >= CHARTER_WORTH_THRESHOLD).length;
  return Math.round((charter / apps.length) * 100);
}

async function query(ctx: MetricContext): Promise<MetricResult> {
  if (ctx.demoMode) {
    const trend = DEMO_CHARTER_TREND;
    const current = trend[trend.length - 1].value;
    const prev = trend[trend.length - 2].value;
    return {
      value: current,
      previousValue: prev,
      change: { absolute: current - prev, percent: current - prev, direction: current >= prev ? 'up' : 'down' },
      format: 'percent',
      sparkline: trend,
      insight: `Charter share is ${current}% (${current - prev >= 0 ? '+' : ''}${current - prev} vs last week). Approving fewer Charters week-over-week suggests the bar is slipping or applicant quality is dropping.`,
      drillDownAvailable: true,
    };
  }

  const { workspaceId, dateRange } = ctx;
  const range = dateRange ?? {
    from: new Date(Date.now() - 90 * 86400000),
    to: new Date(),
  };

  const approved = await db.application.findMany({
    where: { workspaceId, status: 'APPROVED', reviewedAt: { gte: range.from, lte: range.to } },
    select: { archetypeScores: true, reviewedAt: true },
  });

  const current = charterShare(approved);

  // Weekly sparkline across the range (up to 8 buckets).
  const sparkline: TimeSeries = [];
  const weeks = 8;
  const span = range.to.getTime() - range.from.getTime();
  const step = span / weeks;
  for (let i = 0; i < weeks; i++) {
    const wFrom = new Date(range.from.getTime() + i * step);
    const wTo = new Date(range.from.getTime() + (i + 1) * step);
    const inWeek = approved.filter((a) => a.reviewedAt && a.reviewedAt >= wFrom && a.reviewedAt < wTo);
    sparkline.push({ label: weekLabel(wFrom), value: charterShare(inWeek) });
  }

  const prev = sparkline.length >= 2 ? sparkline[sparkline.length - 2].value : current;

  return {
    value: current,
    previousValue: prev,
    change: { absolute: current - prev, percent: current - prev, direction: current >= prev ? 'up' : 'down' },
    format: 'percent',
    sparkline,
    insight: `Charter share this period is ${current}%. Approving fewer Charters week-over-week suggests the curation bar is slipping or applicant quality is dropping.`,
    drillDownAvailable: true,
  };
}

async function drillDown(ctx: MetricContext): Promise<DrillDownRecord[]> {
  if (ctx.demoMode) {
    return [
      { member: 'Maya Okonkwo', tier: 'Charter', worth: 27 },
      { member: 'Camille Foster', tier: 'Charter', worth: 25 },
      { member: 'Theo Abara', tier: 'Charter', worth: 24 },
    ];
  }
  const { workspaceId, dateRange } = ctx;
  const range = dateRange ?? { from: new Date(Date.now() - 90 * 86400000), to: new Date() };
  const approved = await db.application.findMany({
    where: { workspaceId, status: 'APPROVED', reviewedAt: { gte: range.from, lte: range.to } },
    select: { fullName: true, email: true, archetypeScores: true, reviewedAt: true },
  });
  return approved
    .map((a) => ({
      member: a.fullName,
      email: a.email,
      worth: worthTotal(a.archetypeScores),
      approved: a.reviewedAt ? a.reviewedAt.toISOString().slice(0, 10) : '',
    }))
    .filter((r) => r.worth >= CHARTER_WORTH_THRESHOLD)
    .sort((a, b) => b.worth - a.worth);
}

const metric: Metric = {
  id: 'pipeline.charter-conversion',
  name: 'Charter Conversion',
  category: 'pipeline',
  description: 'Share of approved applicants that clear the Charter worth threshold (22/30).',
  businessQuestion: 'Are we approving the right ratio of Charter candidates? Is the curation bar holding?',
  resultType: 'scalar',
  viz: 'number',
  query,
  drillDown,
  refresh: 'cached-hourly',
  mcpExposed: true,
};

registerMetric(metric);
export default metric;
