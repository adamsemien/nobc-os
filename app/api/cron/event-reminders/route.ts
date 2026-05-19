import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTemplatedEmail, getPlatformBool } from '@/lib/email';

/** Day-of reminder cron — runs once a day per Vercel cron schedule (`vercel.json`).
 *
 *  Behaviour (per workspace):
 *   - Skips entirely when PlatformSetting `reminder.enabled` = false.
 *   - Finds events where startAt is between now and end-of-today.
 *   - For each event, sends `event.reminder` to CONFIRMED RSVPs whose
 *     `reminderSentAt` is null (idempotent across multiple cron invocations).
 *
 *  Auth: header `x-vercel-cron-secret` must match `CRON_SECRET`. When called
 *  by Vercel's cron infrastructure the header is set automatically; manual
 *  invocations need to pass it explicitly.
 */
export async function GET(req: NextRequest) {
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.headers.get('x-vercel-cron-secret') ??
    req.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const events = await db.event.findMany({
    where: {
      status: 'PUBLISHED',
      startAt: { gte: now, lte: endOfDay },
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      startAt: true,
      location: true,
      slug: true,
    },
  });

  let totalSent = 0;
  let totalSkipped = 0;
  const perEvent: { eventId: string; sent: number; skipped: number }[] = [];

  for (const ev of events) {
    const enabled = await getPlatformBool(ev.workspaceId, 'reminder.enabled', true);
    if (!enabled) continue;

    const rsvps = await db.rSVP.findMany({
      where: {
        workspaceId: ev.workspaceId,
        eventId: ev.id,
        status: 'CONFIRMED',
        reminderSentAt: null,
      },
      select: {
        id: true,
        member: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    const timeFormatted = ev.startAt.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    let sent = 0;
    let skipped = 0;
    for (const r of rsvps) {
      const result = await sendTemplatedEmail(
        ev.workspaceId,
        'event.reminder',
        r.member.email,
        {
          member: { firstName: r.member.firstName, lastName: r.member.lastName },
          event: { title: ev.title, timeFormatted, location: ev.location ?? '' },
        },
      );
      if (result.ok) {
        sent++;
        await db.rSVP.update({
          where: { id: r.id },
          data: { reminderSentAt: new Date() },
        }).catch(() => {});
        await db.auditEvent.create({
          data: {
            workspaceId: ev.workspaceId,
            action: 'rsvp.reminder_sent',
            entityType: 'RSVP',
            entityId: r.id,
            metadata: { eventId: ev.id },
          },
        }).catch(() => {});
      } else {
        skipped++;
      }
    }
    totalSent += sent;
    totalSkipped += skipped;
    perEvent.push({ eventId: ev.id, sent, skipped });
  }

  return NextResponse.json({
    ok: true,
    runAt: now.toISOString(),
    eventCount: events.length,
    sent: totalSent,
    skipped: totalSkipped,
    perEvent,
  });
}
