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

  let reviewNote: string | null = null;
  try {
    const body = (await req.json()) as { note?: unknown };
    if (typeof body?.note === 'string') reviewNote = body.note.trim().slice(0, 4000) || null;
  } catch { /* optional */ }

  const app = await db.application.findUnique({ where: { id } });
  if (!app) return Response.json({ error: 'Not found' }, { status: 404 });
  if (app.workspaceId !== workspaceId) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const [updatedApp] = await db.$transaction([
    db.application.update({
      where: { id },
      data: {
        status: 'WAITLISTED',
        reviewedAt: new Date(),
        reviewedBy: userId,
        reviewNote,
      },
    }),
    db.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'application.waitlisted',
        entityType: 'APPLICATION',
        entityId: id,
      },
    }),
  ]);

  if (process.env.RESEND_API_KEY) {
    const { render } = await import('@react-email/render');
    const WaitlistEmail = (await import('@/emails/WaitlistEmail')).default;
    const { resend } = await import('@/lib/resend');
    const html = await render(WaitlistEmail({ name: app.fullName }));
    resend.emails.send({
      from: 'The No Bad Company <team@thenobadcompany.com>',
      to: app.email,
      subject: 'your application — no bad company.',
      html,
    }).catch(err => console.error('[waitlist] email failed:', err));
  }

  return Response.json(updatedApp);
}
