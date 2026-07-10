import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTemplatedEmail, getPlatformBool } from '@/lib/email';
import { gateLifecycleEmail } from '@/lib/comms/lifecycle-gate';
import { verifyCronSecret } from '@/lib/cron-auth';

/** Post-event follow-up cron — runs once a day per Vercel cron schedule (`vercel.json`).
 *
 *  Behaviour (per workspace):
 *   - Skips entirely unless PlatformSetting `followup.enabled` = true
 *     (default OFF — a workspace opts in explicitly).
 *   - Finds PUBLISHED events that ended in the last 3 days. "Ended" means
 *     `endAt` has passed; when `endAt` is null the event is treated as ended
 *     6 hours after `startAt` (startAt is required, so there is always a
 *     usable end). The 3-day window bounds first-enable backfill.
 *   - Sends `event.followup` to CONFIRMED, CHECKED-IN attendees whose
 *     `postEventFollowupSentAt` is null (idempotent across invocations).
 *     No-shows are deliberately excluded — the thank-you copy assumes they
 *     were in the room.
 *   - Every send passes the suppression gate first and fails closed
 *     (lib/comms/lifecycle-gate.ts).
 *
 *  Auth: header `x-vercel-cron-secret` must match `CRON_SECRET`, same as the
 *  other crons.
 */

const MS_PER_HOUR = 3_600_000;
const NULL_END_AT_FALLBACK_HOURS = 6;
const WINDOW_DAYS = 3;

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * MS_PER_HOUR);
  const fallbackCutoff = new Date(now.getTime() - NULL_END_AT_FALLBACK_HOURS * MS_PER_HOUR);

  const events = await db.event.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [
        // Ended per its own endAt, within the window.
        { endAt: { lt: now, gte: windowStart } },
        // No endAt: ended 6h after startAt (never fires mid-event).
        { endAt: null, startAt: { lt: fallbackCutoff, gte: windowStart } },
      ],
    },
    select: { id: true, workspaceId: true, title: true },
  });

  let totalSent = 0;
  let totalSkipped = 0;
  const perEvent: { eventId: string; sent: number; skipped: number }[] = [];

  for (const ev of events) {
    const enabled = await getPlatformBool(ev.workspaceId, 'followup.enabled', false);
    if (!enabled) continue;

    const rsvps = await db.rSVP.findMany({
      where: {
        workspaceId: ev.workspaceId,
        eventId: ev.id,
        status: 'CONFIRMED',
        checkedIn: true,
        postEventFollowupSentAt: null,
      },
      select: {
        id: true,
        memberId: true,
        member: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    let sent = 0;
    let skipped = 0;
    for (const r of rsvps) {
      const gate = await gateLifecycleEmail({
        workspaceId: ev.workspaceId,
        email: r.member.email,
        memberId: r.memberId,
        site: 'event.followup',
      });
      if (!gate.send) {
        skipped++;
        continue;
      }
      const result = await sendTemplatedEmail(
        ev.workspaceId,
        'event.followup',
        gate.email,
        {
          member: { firstName: r.member.firstName, lastName: r.member.lastName },
          event: { title: ev.title },
        },
        [{ memberId: r.memberId }],
      );
      if (result.ok) {
        sent++;
        await db.rSVP.update({
          where: { id: r.id },
          data: { postEventFollowupSentAt: new Date() },
        }).catch(() => {});
        await db.auditEvent.create({
          data: {
            workspaceId: ev.workspaceId,
            action: 'rsvp.post_event_followup_sent',
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
