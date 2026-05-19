import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';

const ALLOWED = (process.env.DEV_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export async function POST() {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const workspaceId = await requireWorkspaceId(userId);

  // ── Identify demo records ─────────────────────────────────────────────────
  const demoMembers = await db.member.findMany({
    where: { workspaceId, tags: { has: '__demo' } },
    select: { id: true, email: true },
  });
  const demoMemberIds = demoMembers.map((m) => m.id);
  const demoMemberEmails = demoMembers.map((m) => m.email);

  const demoEvents = await db.event.findMany({
    where: { workspaceId, slug: { startsWith: '__demo-' } },
    select: { id: true },
  });
  const demoEventIds = demoEvents.map((e) => e.id);

  const demoApps = await db.application.findMany({
    where: { workspaceId, aiTags: { has: '__demo' } },
    select: { id: true },
  });
  const demoAppIds = demoApps.map((a) => a.id);

  // Snapshot counts before deletion
  const deletedCounts = {
    members: demoMemberIds.length,
    events: demoEventIds.length,
    rsvps: 0,
    applications: demoAppIds.length,
  };

  // ── Delete in dependency order ────────────────────────────────────────────

  // 1. Tickets — reference RSVP, Member, Event
  if (demoMemberIds.length > 0 || demoEventIds.length > 0) {
    await db.ticket.deleteMany({
      where: {
        workspaceId,
        OR: [
          ...(demoEventIds.length > 0 ? [{ eventId: { in: demoEventIds } }] : []),
          ...(demoMemberIds.length > 0 ? [{ memberId: { in: demoMemberIds } }] : []),
        ],
      },
    });
  }

  // 2. RSVPs — reference Member, Event
  if (demoMemberIds.length > 0 || demoEventIds.length > 0) {
    const rsvpDeleteResult = await db.rSVP.deleteMany({
      where: {
        workspaceId,
        OR: [
          ...(demoEventIds.length > 0 ? [{ eventId: { in: demoEventIds } }] : []),
          ...(demoMemberIds.length > 0 ? [{ memberId: { in: demoMemberIds } }] : []),
        ],
      },
    });
    deletedCounts.rsvps = rsvpDeleteResult.count;
  }

  // 3. WaitlistEntries — reference Member, Event
  if (demoMemberIds.length > 0 || demoEventIds.length > 0) {
    await db.waitlistEntry.deleteMany({
      where: {
        workspaceId,
        OR: [
          ...(demoEventIds.length > 0 ? [{ eventId: { in: demoEventIds } }] : []),
          ...(demoMemberIds.length > 0 ? [{ memberId: { in: demoMemberIds } }] : []),
        ],
      },
    });
  }

  // 4. EventCustomQuestions — reference Event
  if (demoEventIds.length > 0) {
    await db.eventCustomQuestion.deleteMany({
      where: { workspaceId, eventId: { in: demoEventIds } },
    });
  }

  // 5. ApplicationAnswers — reference Application
  if (demoAppIds.length > 0) {
    await db.applicationAnswer.deleteMany({
      where: { applicationId: { in: demoAppIds } },
    });
  }

  // 6. Applications
  if (demoAppIds.length > 0) {
    await db.application.deleteMany({
      where: { workspaceId, id: { in: demoAppIds } },
    });
  }

  // 7. WatchList entries matching demo member emails
  if (demoMemberEmails.length > 0) {
    await db.watchList.deleteMany({
      where: { workspaceId, matchEmail: { in: demoMemberEmails } },
    });
  }

  // 8. Members
  if (demoMemberIds.length > 0) {
    await db.member.deleteMany({
      where: { workspaceId, id: { in: demoMemberIds } },
    });
  }

  // 9. Events
  if (demoEventIds.length > 0) {
    await db.event.deleteMany({
      where: { workspaceId, id: { in: demoEventIds } },
    });
  }

  return NextResponse.json({ success: true, deletedCounts });
}
