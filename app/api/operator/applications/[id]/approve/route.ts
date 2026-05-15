import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { welcomeEmail } from '@/lib/email-templates';
import { generateMemberPass } from '@/lib/wallet-pass';
import { resend } from '@/lib/resend';
import { MemberStatus } from '@prisma/client';

export async function POST(
  _req: NextRequest,
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
    return Response.json({ error: 'Already approved' }, { status: 409 });
  }

  const memberQrCode = randomBytes(8).toString('hex');
  const now = new Date();
  const [firstName, ...rest] = app.fullName.trim().split(' ');
  const lastName = rest.join(' ') || '';

  const [updatedApp, member] = await db.$transaction([
    db.application.update({
      where: { id },
      data: { status: 'APPROVED', reviewedAt: now, reviewedBy: userId },
    }),
    db.member.upsert({
      where: { workspaceId_email: { workspaceId, email: app.email } },
      create: {
        workspaceId,
        clerkUserId: `applicant:${app.id}`,
        email: app.email,
        firstName,
        lastName,
        phone: app.phone ?? undefined,
        status: MemberStatus.APPROVED,
        approved: true,
        approvedAt: now,
        memberQrCode,
      },
      update: {
        status: MemberStatus.APPROVED,
        approved: true,
        approvedAt: now,
        memberQrCode: { set: memberQrCode },
      },
    }),
    db.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'application.approved',
        entityType: 'APPLICATION',
        entityId: id,
      },
    }),
  ]);

  // Generate wallet pass fire-and-forget; get URLs to include in welcome email
  let passUrls: { appleWalletUrl?: string; googleWalletUrl?: string } = {};
  if (process.env.PASSNINJA_ACCOUNT_ID && process.env.PASSNINJA_API_KEY) {
    const result = await generateMemberPass(member.id).catch(() => null);
    if (result) {
      passUrls = { appleWalletUrl: result.appleWalletUrl, googleWalletUrl: result.googleWalletUrl };
    }
  }

  if (process.env.RESEND_API_KEY) {
    const { subject, html } = welcomeEmail(app.fullName, passUrls);
    await resend.emails.send({
      from: 'NoBC <noreply@thenobadcompany.com>',
      to: app.email,
      subject,
      html,
    }).catch(err => console.error('[approve] email failed:', err));
  }

  return Response.json({ application: updatedApp, member });
}
