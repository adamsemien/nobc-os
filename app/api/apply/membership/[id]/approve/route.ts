import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { render } from '@react-email/render';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { resend } from '@/lib/resend';
import WelcomeEmail from '@/emails/WelcomeEmail';
import WaitlistEmail from '@/emails/WaitlistEmail';
import DeclineEmail from '@/emails/DeclineEmail';

type Decision = 'approved' | 'waitlisted' | 'declined';

const statusMap = {
  approved: 'APPROVED',
  waitlisted: 'WAITLISTED',
  declined: 'DECLINED',
} as const;

const subjectMap: Record<Decision, string> = {
  approved: "you're in. welcome to no bad company.",
  waitlisted: 'your application — no bad company.',
  declined: 'your application — no bad company.',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;
  const body = await req.json() as { decision?: unknown; note?: unknown };
  const { decision, note } = body;

  if (!decision || !['approved', 'waitlisted', 'declined'].includes(decision as string)) {
    return NextResponse.json({ error: 'decision must be approved | waitlisted | declined' }, { status: 400 });
  }

  const d = decision as Decision;
  const noteStr = typeof note === 'string' ? note : undefined;

  const application = await db.application.findUnique({
    where: { id, workspaceId },
  });
  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();

  await db.application.update({
    where: { id },
    data: {
      status: statusMap[d],
      reviewedAt: now,
      reviewedBy: userId,
      reviewNote: noteStr ?? null,
    },
  });

  if (d === 'approved') {
    const nameParts = application.fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const member = await db.member.upsert({
      where: { workspaceId_email: { workspaceId, email: application.email } },
      update: { status: 'APPROVED', approved: true, approvedAt: now },
      create: {
        workspaceId,
        clerkUserId: `app_${application.id}`,
        email: application.email,
        firstName,
        lastName,
        phone: application.phone ?? undefined,
        status: 'APPROVED',
        approved: true,
        approvedAt: now,
      },
    });

    await db.application.update({ where: { id }, data: { memberId: member.id } });
  }

  const emailHtml = await render(
    d === 'approved'
      ? WelcomeEmail({ name: application.fullName, archetype: application.archetype ?? undefined })
      : d === 'waitlisted'
        ? WaitlistEmail({ name: application.fullName })
        : DeclineEmail({ name: application.fullName }),
  );

  await resend.emails.send({
    from: 'The No Bad Company <team@thenobadcompany.com>',
    to: application.email,
    subject: subjectMap[d],
    html: emailHtml,
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: `application.${d}`,
      entityType: 'Application',
      entityId: id,
      metadata: noteStr ? { note: noteStr } : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}
