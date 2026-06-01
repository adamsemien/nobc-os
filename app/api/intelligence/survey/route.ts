/**
 * POST /api/intelligence/survey — dispatch a brand-lift survey for an event + sponsor.
 *
 * Body: { eventId, sponsorBrandId, phase: 'PRE' | 'POST' }. Creates one SurveyResponse invite
 * (token + sentAt) per eligible attendee that doesn't already have one for this phase, and emails
 * the magic link from team@thenobadcompany.com. STAFF-gated, workspace-scoped. Node runtime.
 */
import { NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { db } from '@/lib/db';
import { mintShareToken } from '@/lib/share/token';
import { sendTemplatedEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 120;

function surveyUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return base ? `${base}/survey/${token}` : `/survey/${token}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  const sponsorBrandId = typeof body?.sponsorBrandId === 'string' ? body.sponsorBrandId : '';
  const phase = body?.phase === 'PRE' ? 'PRE' : body?.phase === 'POST' ? 'POST' : null;
  if (!eventId || !sponsorBrandId || !phase) {
    return NextResponse.json({ error: 'eventId, sponsorBrandId and phase (PRE|POST) are required' }, { status: 400 });
  }

  const [event, sponsor] = await Promise.all([
    db.event.findFirst({ where: { id: eventId, workspaceId }, select: { title: true } }),
    db.sponsorBrandProfile.findFirst({ where: { id: sponsorBrandId, workspaceId }, select: { name: true } }),
  ]);
  if (!event || !sponsor) return NextResponse.json({ error: 'Event or sponsor not found' }, { status: 404 });

  // POST → people who actually attended; PRE → confirmed registrants.
  const rsvps = await db.rSVP.findMany({
    where: {
      workspaceId,
      eventId,
      ...(phase === 'POST' ? { checkedIn: true } : { ticketStatus: { in: ['confirmed', 'held'] } }),
    },
    select: { memberId: true, guestEmail: true, member: { select: { email: true, firstName: true } } },
  });

  const existing = await db.surveyResponse.findMany({
    where: { workspaceId, eventId, sponsorBrandId, phase },
    select: { memberId: true },
  });
  const alreadyInvited = new Set(existing.map((e) => e.memberId));

  let invited = 0;
  let sent = 0;
  let skipped = 0;

  for (const r of rsvps) {
    if (alreadyInvited.has(r.memberId)) { skipped++; continue; }
    const email = (r.member?.email ?? r.guestEmail ?? '').trim();
    // Skip missing addresses and seeded demo addresses (never email @nobc.demo).
    if (!email || email.endsWith('@nobc.demo')) { skipped++; continue; }

    const token = mintShareToken();
    await db.surveyResponse.create({
      data: { workspaceId, eventId, sponsorBrandId, memberId: r.memberId, phase, token, sentAt: new Date() },
    });
    invited++;

    const intro =
      phase === 'PRE'
        ? `Before ${event.title}, a quick read on where ${sponsor.name} sits for you today.`
        : `Thank you for joining us at ${event.title}. A quick word on ${sponsor.name}.`;
    const res = await sendTemplatedEmail(workspaceId, 'sponsor.survey_invite', email, {
      member: { firstName: r.member?.firstName ?? 'there' },
      event: { title: event.title },
      survey: { intro, cta: phase === 'PRE' ? 'Answer two questions' : 'Share your read', url: surveyUrl(token) },
    });
    if (res.ok) sent++;
  }

  return NextResponse.json({ ok: true, phase, invited, sent, skipped });
}
