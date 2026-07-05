import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/operator-role';

import { emitEvent } from '@/lib/emit-event';
import { cancelRsvp } from '@/lib/waitlist';
import { ACTIVE_EVENT_ID } from '@/lib/active-event';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission('application.decide');
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  const app = await db.application.findUnique({ where: { id } });

  if (!app) return Response.json({ error: 'Not found' }, { status: 404 });
  if (app.workspaceId !== workspaceId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (app.status === 'APPROVED') {
    return Response.json({ error: 'Cannot reject an already-approved application' }, { status: 409 });
  }
  if (app.status === 'REJECTED') {
    return Response.json({ error: 'Already rejected' }, { status: 409 });
  }

  let reason: string | undefined;
  let reviewNote: string | null = null;
  try {
    const body = (await req.json()) as { reason?: unknown; note?: unknown };
    if (typeof body?.reason === 'string') {
      reason = body.reason.trim().slice(0, 4000) || undefined;
    }
    reviewNote = typeof body?.note === 'string' ? body.note.trim().slice(0, 4000) || null : null;
  } catch {
    /* optional body */
  }

  const updatedApp = await db.application.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedBy: userId,
      rejectionReason: reason ?? null,
      reviewNote,
    },
  });

  // Door 1: cancel the application-issued comp RSVP for the active event. The
  // applicant is resolved by email (Application.memberId is only set on approve),
  // then cancelRsvp releases the seat. Fail-closed — logged, never throws.
  try {
    const member = await db.member.findFirst({
      where: { workspaceId, email: app.email.trim().toLowerCase() },
      select: { id: true },
    });
    if (member) {
      const compRsvp = await db.rSVP.findFirst({
        where: {
          workspaceId,
          eventId: ACTIVE_EVENT_ID,
          memberId: member.id,
          isComp: true,
          compType: 'APPLICATION',
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (compRsvp) {
        await cancelRsvp(compRsvp.id, workspaceId);
      } else {
        console.warn(
          `[door1-comp] reject: no application comp RSVP for ${app.email} / event ${ACTIVE_EVENT_ID}`,
        );
      }
    }
  } catch (err) {
    console.error('[door1-comp] reject: cancel failed:', err);
  }

  // emitEvent writes AuditEvent + Svix
  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'application.rejected',
    entityType: 'APPLICATION',
    entityId: id,
    metadata: { reason: reason ?? null },
  });

  if (process.env.RESEND_API_KEY) {
    const { applicationRejectedEmail } = await import('@/lib/email-templates');
    const { resend } = await import('@/lib/resend');
    const { subject, html } = applicationRejectedEmail(app.fullName);
    resend.emails.send({
      from: 'The No Bad Company <team@thenobadcompany.com>',
      to: app.email,
      subject,
      html,
    }).catch(err => console.error('[reject] email failed:', err));
  }

  return Response.json(updatedApp);
}
