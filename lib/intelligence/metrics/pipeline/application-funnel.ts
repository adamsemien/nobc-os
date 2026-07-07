import { db } from '@/lib/db';
import { registerMetric } from '@/lib/intelligence/registry';
import type { DrillDownRecord, Metric, MetricContext, MetricResult } from '@/lib/intelligence/types';
import { DEMO_FUNNEL } from '@/lib/intelligence/demo-data';

function insightFor(approved: number, firstRsvp: number): string {
  const rate = approved > 0 ? Math.round((firstRsvp / approved) * 100) : 0;
  return `${rate}% of approved applicants confirm access within the period; the gap between approval and first event is your activation problem if this is under 60%.`;
}

async function query(ctx: MetricContext): Promise<MetricResult> {
  if (ctx.demoMode) {
    const f = DEMO_FUNNEL;
    return {
      value: [
        { label: 'Submitted', value: f.submitted },
        { label: 'Approved', value: f.approved },
        { label: 'First Event Access', value: f.firstRsvp },
        { label: 'Repeat (2+)', value: f.repeat },
      ],
      format: 'number',
      insight: insightFor(f.approved, f.firstRsvp),
      drillDownAvailable: true,
    };
  }

  const { workspaceId, dateRange } = ctx;
  const range = dateRange ? { gte: dateRange.from, lte: dateRange.to } : undefined;
  const appWhere = { workspaceId, ...(range ? { createdAt: range } : {}) };

  const [submitted, approved, approvedApplicantRows] = await Promise.all([
    db.application.count({ where: appWhere }),
    db.application.count({ where: { ...appWhere, status: 'APPROVED' } }),
    db.application.findMany({
      where: { ...appWhere, status: 'APPROVED', memberId: { not: null } },
      select: { memberId: true },
    }),
  ]);

  // First RSVP / Repeat must be a nested subset of Approved, so count RSVP activity
  // over approved APPLICANTS only — the members linked to an approved application —
  // not over every approved member. Counting all approved members let people approved
  // outside the application flow inflate later stages past 100% (First RSVP 115 of an
  // Approved of 11 → 1045%).
  const applicantMemberIds = approvedApplicantRows
    .map((a) => a.memberId)
    .filter((id): id is string => id !== null);
  const applicantMembers = applicantMemberIds.length
    ? await db.member.findMany({
        where: { workspaceId, id: { in: applicantMemberIds } },
        select: { _count: { select: { rsvps: true } } },
      })
    : [];
  const firstRsvp = applicantMembers.filter((m) => m._count.rsvps >= 1).length;
  const repeat = applicantMembers.filter((m) => m._count.rsvps >= 2).length;

  return {
    value: [
      { label: 'Submitted', value: submitted },
      { label: 'Approved', value: approved },
      { label: 'First Event Access', value: firstRsvp },
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
      { member: 'Wesley Kim', stage: 'Approved — no event access yet', approved: 'Aug 2025' },
      { member: 'Margot Devereux', stage: 'Approved — no event access yet', approved: 'Aug 2025' },
      { member: 'Levi Steinberg', stage: 'Approved — no event access yet', approved: 'Sep 2025' },
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
    stage: 'Approved — no event access yet',
    approved: m.approvedAt ? m.approvedAt.toISOString().slice(0, 10) : '',
  }));
}

const metric: Metric = {
  id: 'pipeline.application-funnel',
  name: 'Application Funnel',
  category: 'pipeline',
  description: 'Conversion through submitted → approved → first event access → repeat attender.',
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
