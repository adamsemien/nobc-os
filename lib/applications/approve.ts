/** Application approval — shared by the operator API route and the agent
 *  `applications.approve` tool, so both go through identical logic:
 *  flip status → APPROVED, upsert the Member, fire wallet pass + welcome
 *  email, emit audit events. */
import { randomBytes } from 'crypto';
import { MemberStatus, type Application, type AuditActorType, type Member } from '@prisma/client';
import { db } from '@/lib/db';
import { emitEvent } from '@/lib/emit-event';
import { welcomeEmail } from '@/lib/email-templates';
import { generateMemberPass } from '@/lib/wallet-pass';
import { resend } from '@/lib/resend';

export type ApproveOutcome =
  | { ok: true; application: Application; member: Member }
  | { ok: false; error: 'not_found' | 'forbidden' | 'already_approved' };

export async function approveApplication(params: {
  applicationId: string;
  workspaceId: string;
  actorId: string;
  actorType?: AuditActorType;
  reviewNote?: string;
}): Promise<ApproveOutcome> {
  const { applicationId, workspaceId, actorId, actorType, reviewNote } = params;

  const app = await db.application.findUnique({ where: { id: applicationId } });
  if (!app) return { ok: false, error: 'not_found' };
  if (app.workspaceId !== workspaceId) return { ok: false, error: 'forbidden' };
  if (app.status === 'APPROVED') return { ok: false, error: 'already_approved' };

  const memberQrCode = randomBytes(8).toString('hex');
  const now = new Date();
  const [firstName, ...rest] = app.fullName.trim().split(' ');
  const lastName = rest.join(' ') || '';

  // Check before upsert so we can emit member.created vs nothing.
  const existingMember = await db.member.findUnique({
    where: { workspaceId_email: { workspaceId, email: app.email } },
    select: { id: true },
  });

  const [application, member] = await db.$transaction([
    db.application.update({
      where: { id: applicationId },
      data: { status: 'APPROVED', reviewedAt: now, reviewedBy: actorId, reviewNote: reviewNote ?? null },
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
  ]);

  await emitEvent({
    workspaceId,
    actorId,
    actorType,
    action: 'application.approved',
    entityType: 'APPLICATION',
    entityId: applicationId,
    metadata: { memberId: member.id },
  });
  if (!existingMember) {
    await emitEvent({
      workspaceId,
      actorId,
      actorType,
      action: 'member.created',
      entityType: 'MEMBER',
      entityId: member.id,
      metadata: { applicationId, email: app.email },
    });
  }

  // Wallet pass — best effort; URLs flow into the welcome email.
  let passUrls: { appleWalletUrl?: string; googleWalletUrl?: string } = {};
  if (process.env.PASSNINJA_ACCOUNT_ID && process.env.PASSNINJA_API_KEY) {
    const result = await generateMemberPass(member.id).catch(() => null);
    if (result) {
      passUrls = { appleWalletUrl: result.appleWalletUrl, googleWalletUrl: result.googleWalletUrl };
    }
  }

  if (process.env.RESEND_API_KEY) {
    const { subject, html } = welcomeEmail(app.fullName, passUrls);
    await resend.emails
      .send({ from: 'NoBC <team@thenobadcompany.com>', to: app.email, subject, html })
      .catch((err) => console.error('[approve] email failed:', err));
  }

  return { ok: true, application, member };
}
