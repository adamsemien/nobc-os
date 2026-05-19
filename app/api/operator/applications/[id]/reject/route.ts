import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { emitEvent } from '@/lib/emit-event';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
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
      from: 'NoBC <team@thenobadcompany.com>',
      to: app.email,
      subject,
      html,
    }).catch(err => console.error('[reject] email failed:', err));
  }

  return Response.json(updatedApp);
}
