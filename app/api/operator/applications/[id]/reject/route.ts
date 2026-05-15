import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

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

  let reason: string | undefined;
  try {
    const body = (await req.json()) as { reason?: unknown };
    if (typeof body?.reason === 'string') {
      reason = body.reason.trim().slice(0, 4000) || undefined;
    }
  } catch {
    /* optional body */
  }

  const [updatedApp] = await db.$transaction([
    db.application.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedBy: userId,
        rejectionReason: reason ?? null,
      },
    }),
    db.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'application.rejected',
        entityType: 'APPLICATION',
        entityId: id,
      },
    }),
  ]);

  if (process.env.RESEND_API_KEY) {
    const { applicationRejectedEmail } = await import('@/lib/email-templates');
    const { resend } = await import('@/lib/resend');
    const { subject, html } = applicationRejectedEmail(app.fullName);
    resend.emails.send({
      from: 'NoBC <noreply@thenobadcompany.com>',
      to: app.email,
      subject,
      html,
    }).catch(err => console.error('[reject] email failed:', err));
  }

  return Response.json(updatedApp);
}
