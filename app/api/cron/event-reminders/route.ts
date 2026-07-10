import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTemplatedEmail, getPlatformBool, getPlatformSetting } from '@/lib/email';
import { gateLifecycleEmail } from '@/lib/comms/lifecycle-gate';
import { verifyCronSecret } from '@/lib/cron-auth';

/** Event reminder cron — runs once a day per Vercel cron schedule (`vercel.json`).
 *
 *  Day-of section (per workspace):
 *   - Skips entirely when PlatformSetting `reminder.enabled` = false.
 *   - Finds events where startAt is between now and end-of-today.
 *   - For each event, sends `event.reminder` to CONFIRMED RSVPs whose
 *     `reminderSentAt` is null (idempotent across multiple cron invocations).
 *
 *  Pre-event section (per workspace, default OFF):
 *   - Skips unless PlatformSetting `reminder.pre_event.enabled` = true.
 *   - Sends `event.reminder_upcoming` when the event is exactly
 *     `reminder.pre_event.days_before` calendar days out (UTC days, matching
 *     the day-of section's day boundary), to CONFIRMED RSVPs whose
 *     `preEventReminderSentAt` is null.
 *
 *  Every send (both sections) passes the suppression gate first and fails
 *  closed (lib/comms/lifecycle-gate.ts).
 *
 *  Auth: header `x-vercel-cron-secret` must match `CRON_SECRET`. When called
 *  by Vercel's cron infrastructure the header is set automatically; manual
 *  invocations need to pass it explicitly.
 */

const MS_PER_DAY = 86_400_000;
const PRE_EVENT_LOOKAHEAD_DAYS = 30;
const PRE_EVENT_DEFAULT_DAYS_BEFORE = 3;

function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

async function preEventDaysBefore(workspaceId: string): Promise<number> {
  const raw = await getPlatformSetting(workspaceId, 'reminder.pre_event.days_before');
  const n = raw == null ? NaN : parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 && n <= PRE_EVENT_LOOKAHEAD_DAYS
    ? n
    : PRE_EVENT_DEFAULT_DAYS_BEFORE;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
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
        memberId: true,
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
      const gate = await gateLifecycleEmail({
        workspaceId: ev.workspaceId,
        email: r.member.email,
        memberId: r.memberId,
        site: 'event.reminder',
      });
      if (!gate.send) {
        skipped++;
        continue;
      }
      const result = await sendTemplatedEmail(
        ev.workspaceId,
        'event.reminder',
        gate.email,
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

  // ── Pre-event section (N days before, default OFF per workspace) ──────────
  let preEventSent = 0;
  let preEventSkipped = 0;
  const preEventPerEvent: { eventId: string; sent: number; skipped: number }[] = [];

  const upcoming = await db.event.findMany({
    where: {
      status: 'PUBLISHED',
      startAt: {
        gt: endOfDay,
        lte: new Date(now.getTime() + PRE_EVENT_LOOKAHEAD_DAYS * MS_PER_DAY),
      },
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      startAt: true,
      location: true,
    },
  });

  for (const ev of upcoming) {
    const enabled = await getPlatformBool(ev.workspaceId, 'reminder.pre_event.enabled', false);
    if (!enabled) continue;

    const daysBefore = await preEventDaysBefore(ev.workspaceId);
    const daysUntil = Math.round((utcDayStart(ev.startAt) - utcDayStart(now)) / MS_PER_DAY);
    if (daysUntil !== daysBefore) continue;

    const rsvps = await db.rSVP.findMany({
      where: {
        workspaceId: ev.workspaceId,
        eventId: ev.id,
        status: 'CONFIRMED',
        preEventReminderSentAt: null,
      },
      select: {
        id: true,
        memberId: true,
        member: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    const dateFormatted = ev.startAt.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/Chicago',
    });
    const timeFormatted = ev.startAt.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
    });

    let sent = 0;
    let skipped = 0;
    for (const r of rsvps) {
      const gate = await gateLifecycleEmail({
        workspaceId: ev.workspaceId,
        email: r.member.email,
        memberId: r.memberId,
        site: 'event.reminder_upcoming',
      });
      if (!gate.send) {
        skipped++;
        continue;
      }
      const result = await sendTemplatedEmail(
        ev.workspaceId,
        'event.reminder_upcoming',
        gate.email,
        {
          member: { firstName: r.member.firstName, lastName: r.member.lastName },
          event: { title: ev.title, dateFormatted, timeFormatted, location: ev.location ?? '' },
        },
        [{ memberId: r.memberId }],
      );
      if (result.ok) {
        sent++;
        await db.rSVP.update({
          where: { id: r.id },
          data: { preEventReminderSentAt: new Date() },
        }).catch(() => {});
        await db.auditEvent.create({
          data: {
            workspaceId: ev.workspaceId,
            action: 'rsvp.pre_event_reminder_sent',
            entityType: 'RSVP',
            entityId: r.id,
            metadata: { eventId: ev.id, daysBefore },
          },
        }).catch(() => {});
      } else {
        skipped++;
      }
    }
    preEventSent += sent;
    preEventSkipped += skipped;
    preEventPerEvent.push({ eventId: ev.id, sent, skipped });
  }

  return NextResponse.json({
    ok: true,
    runAt: now.toISOString(),
    eventCount: events.length,
    sent: totalSent,
    skipped: totalSkipped,
    perEvent,
    preEvent: {
      eventCount: preEventPerEvent.length,
      sent: preEventSent,
      skipped: preEventSkipped,
      perEvent: preEventPerEvent,
    },
  });
}
