import { db } from '@/lib/db';
import { registerMetric } from '@/lib/intelligence/registry';
import type { DrillDownRecord, Metric, MetricContext, MetricResult } from '@/lib/intelligence/types';
import { DEMO_FUNNEL } from '@/lib/intelligence/demo-data';

function insightFor(approved: number, firstRsvp: number): string {
  const rate = approved > 0 ? Math.round((firstRsvp / approved) * 100) : 0;
  return `${rate}% of approved members RSVP within the period; the gap between approval and first event is your activation problem if this is under 60%.`;
}

async function query(ctx: MetricContext): Promise<MetricResult> {
  if (ctx.demoMode) {
    const f = DEMO_FUNNEL;
    return {
      value: [
        { label: 'Submitted', value: f.submitted },
        { label: 'Approved', value: f.approved },
        { label: 'First RSVP', value: f.firstRsvp },
        { label: 'Repeat (2+)', value: f.repeat },
      ],
      format: 'number',
      insight: insightFor(f.approved, f.firstRsvp),
      drillDownAvailable: true,
    };
  }

  const { workspaceId, dateRange } = ctx;
  const range = dateRange ? { gte: dateRange.from, lte: dateRange.to } : undefined;

  const [submitted, approved, members] = await Promise.all([
    db.application.count({ where: { workspaceId, ...(range ? { createdAt: range } : {}) } }),
    db.application.count({
      where: { workspaceId, status: 'APPROVED', ...(range ? { createdAt: range } : {}) },
    }),
    db.member.findMany({
      where: { workspaceId, status: 'APPROVED' },
      select: { id: true, _count: { select: { rsvps: true } } },
    }),
  ]);

  const firstRsvp = members.filter((m) => m._count.rsvps >= 1).length;
  const repeat = members.filter((m) => m._count.rsvps >= 2).length;

  return {
    value: [
      { label: 'Submitted', value: submitted },
      { label: 'Approved', value: approved },
      { label: 'First RSVP', value: firstRsvp },
      { label: 'Repeat (2+)', value: repeat },
    ],
    format: 'number',
    insight: insightFor(approved, firstRsvp),
    drillDownAvailable: true,
  };
}

async function drillDown(ctx: MetricContext): Promise<DrillDownRecord[]> {
  if (ctx.demoMode) {
    return [
      { member: 'Wesley Kim', stage: 'Approved — no RSVP', approved: 'Aug 2025' },
      { member: 'Margot Devereux', stage: 'Approved — no RSVP', approved: 'Aug 2025' },
      { member: 'Levi Steinberg', stage: 'Approved — no RSVP', approved: 'Sep 2025' },
    ];
  }
  const stalled = await db.member.findMany({
    where: { workspaceId: ctx.workspaceId, status: 'APPROVED', rsvps: { none: {} } },
    select: { firstName: true, lastName: true, email: true, approvedAt: true },
    orderBy: { approvedAt: 'desc' },
    take: 100,
  });
  return stalled.map((m) => ({
    member: `${m.firstName} ${m.lastName}`.trim(),
    email: m.email,
    stage: 'Approved — no RSVP',
    approved: m.approvedAt ? m.approvedAt.toISOString().slice(0, 10) : '',
  }));
}

const metric: Metric = {
  id: 'pipeline.application-funnel',
  name: 'Application Funnel',
  category: 'pipeline',
  description: 'Conversion through submitted → approved → first RSVP → repeat attender.',
  businessQuestion: 'Where do applicants drop off between submission and becoming an active member?',
  resultType: 'cohort',
  viz: 'funnel',
  query,
  drillDown,
  refresh: 'cached-5min',
  mcpExposed: true,
};

registerMetric(metric);
export default metric;
