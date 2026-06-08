import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

// Force the underlying queries through Next.js's response-time data cache.
// In Next 15 App Router, dynamic route handlers default to no-store; opt in
// with `revalidate` so the response is reused for 30s across operator tabs.
export const revalidate = 30;

export type OperatorCounts = {
  applications: {
    pending: number;
    hold: number;
    approved: number;
    rejected: number;
    waitlisted: number;
  };
  members: {
    total: number;
    charter: number;
    standard: number;
    waitlist: number;
  };
  events: {
    upcoming: number;
    todayCount: number;
    past: number;
  };
  rsvps: {
    todayCount: number;
    confirmedNext7d: number;
  };
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const workspaceId = await requireWorkspaceId(userId);

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const sevenDays = new Date(now);
  sevenDays.setDate(sevenDays.getDate() + 7);

  const [
    appPending,
    appHold,
    appApproved,
    appRejected,
    appWaitlisted,
    membersTotal,
    membersWithApp,
    eventsUpcoming,
    eventsToday,
    eventsPast,
    rsvpsToday,
    rsvpsNext7d,
  ] = await Promise.all([
    db.application.count({ where: { workspaceId, status: 'PENDING' } }),
    db.application.count({ where: { workspaceId, status: 'HOLD' } }),
    db.application.count({ where: { workspaceId, status: 'APPROVED' } }),
    db.application.count({ where: { workspaceId, status: 'REJECTED' } }),
    db.application.count({ where: { workspaceId, status: 'WAITLISTED' } }),
    db.member.count({ where: { workspaceId, status: 'APPROVED', mergedIntoId: null } }),
    db.application.findMany({
      where: { workspaceId, status: 'APPROVED' },
      select: { aiScore: true },
    }),
    db.event.count({
      where: { workspaceId, status: 'PUBLISHED', startAt: { gte: now } },
    }),
    db.event.count({
      where: {
        workspaceId,
        status: 'PUBLISHED',
        startAt: { gte: startOfDay, lt: endOfDay },
      },
    }),
    db.event.count({
      where: { workspaceId, status: 'PUBLISHED', startAt: { lt: now } },
    }),
    db.rSVP.count({
      where: {
        workspaceId,
        event: { startAt: { gte: startOfDay, lt: endOfDay } },
        status: 'CONFIRMED',
      },
    }),
    db.rSVP.count({
      where: {
        workspaceId,
        event: { startAt: { gte: now, lt: sevenDays } },
        status: 'CONFIRMED',
      },
    }),
  ]);

  // Tier bucketing on the canonical 0–1 aiScore (see CLAUDE.md).
  // charter >= 0.73 (22/30), standard >= 0.53 (16/30), else waitlist.
  let charter = 0;
  let standard = 0;
  let waitlist = 0;
  for (const a of membersWithApp) {
    const s = a.aiScore ?? 0;
    if (s >= 0.73) charter++;
    else if (s >= 0.53) standard++;
    else waitlist++;
  }

  const payload: OperatorCounts = {
    applications: {
      pending: appPending,
      hold: appHold,
      approved: appApproved,
      rejected: appRejected,
      waitlisted: appWaitlisted,
    },
    members: {
      total: membersTotal,
      charter,
      standard,
      waitlist,
    },
    events: {
      upcoming: eventsUpcoming,
      todayCount: eventsToday,
      past: eventsPast,
    },
    rsvps: {
      todayCount: rsvpsToday,
      confirmedNext7d: rsvpsNext7d,
    },
  };

  return NextResponse.json(payload);
}
