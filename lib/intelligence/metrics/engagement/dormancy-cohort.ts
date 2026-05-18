import { db } from '@/lib/db';
import { registerMetric } from '@/lib/intelligence/registry';
import type { DrillDownRecord, Metric, MetricContext, MetricResult, RecordList } from '@/lib/intelligence/types';
import { DEMO_DORMANT } from '@/lib/intelligence/demo-data';

const DORMANT_DAYS = 90;

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type DormantRow = { member: string; email: string; cohort: string; daysSinceRsvp: number };

async function getDormant(workspaceId: string): Promise<DormantRow[]> {
  const members = await db.member.findMany({
    where: { workspaceId, status: 'APPROVED' },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      approvedAt: true,
      rsvps: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  const now = Date.now();
  return members
    .map((m) => {
      const last = m.rsvps[0]?.createdAt ?? m.approvedAt ?? null;
      const days = last ? Math.floor((now - last.getTime()) / 86400000) : 999;
      return {
        member: `${m.firstName} ${m.lastName}`.trim(),
        email: m.email,
        cohort: m.approvedAt ? monthLabel(m.approvedAt) : 'Unknown',
        daysSinceRsvp: days,
      };
    })
    .filter((r) => r.daysSinceRsvp > DORMANT_DAYS)
    .sort((a, b) => b.daysSinceRsvp - a.daysSinceRsvp);
}

function worstCohort(rows: { cohort: string }[]): string {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.cohort] = (counts[r.cohort] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : '—';
}

async function query(ctx: MetricContext): Promise<MetricResult> {
  if (ctx.demoMode) {
    const value: RecordList = DEMO_DORMANT.map((d) => ({
      member: d.name,
      cohort: d.cohort,
      archetype: d.archetype,
      daysSinceRsvp: d.daysSinceRsvp,
    }));
    return {
      value,
      format: 'number',
      unit: 'members',
      insight: `${DEMO_DORMANT.length} members are dormant past 90 days; the ${worstCohort(DEMO_DORMANT.map((d) => ({ cohort: d.cohort })))} approval cohort has the highest dormancy.`,
      drillDownAvailable: true,
    };
  }

  const dormant = await getDormant(ctx.workspaceId);
  const value: RecordList = dormant.slice(0, 50).map((d) => ({
    member: d.member,
    cohort: d.cohort,
    daysSinceRsvp: d.daysSinceRsvp,
  }));

  return {
    value,
    format: 'number',
    unit: 'members',
    insight: dormant.length
      ? `${dormant.length} members are dormant past 90 days; the ${worstCohort(dormant)} approval cohort has the highest dormancy rate.`
      : 'No dormant members past 90 days — engagement is healthy.',
    drillDownAvailable: true,
  };
}

async function drillDown(ctx: MetricContext): Promise<DrillDownRecord[]> {
  if (ctx.demoMode) {
    return DEMO_DORMANT.map((d) => ({
      member: d.name,
      cohort: d.cohort,
      archetype: d.archetype,
      daysSinceRsvp: d.daysSinceRsvp,
      action: 're-engagement nudge (House Phone — V1.5)',
    }));
  }
  const dormant = await getDormant(ctx.workspaceId);
  return dormant.map((d) => ({
    member: d.member,
    email: d.email,
    cohort: d.cohort,
    daysSinceRsvp: d.daysSinceRsvp,
    action: 're-engagement nudge (House Phone — V1.5)',
  }));
}

const metric: Metric = {
  id: 'engagement.dormancy-cohort',
  name: 'Dormancy Cohort',
  category: 'engagement',
  description: 'Approved members with no RSVP in over 90 days, grouped by approval month.',
  businessQuestion: 'Who joined and went quiet? These are re-engagement targets and a signal of community health.',
  resultType: 'cohort',
  viz: 'table',
  query,
  drillDown,
  refresh: 'cached-hourly',
  mcpExposed: true,
};

registerMetric(metric);
export default metric;
