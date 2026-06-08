/** Application approval — shared by the operator API route and the agent
 *  `applications.approve` tool, so both go through identical logic:
 *  flip status → APPROVED, upsert the Member, fire wallet pass + welcome
 *  email, emit audit events. */
import { MemberStatus, type Application, type AuditActorType, type Member } from '@prisma/client';
import { db } from '@/lib/db';
import { resolveMember } from '@/lib/member-identity';
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

  const now = new Date();

  // Check before resolve so we can emit member.created vs nothing.
  const existingMember = await db.member.findUnique({
    where: { workspaceId_email: { workspaceId, email: app.email } },
    select: { id: true },
  });

  // Resolve the canonical GUEST member (mints QR if new), then promote it in the
  // same transaction and link the Application to it. This preserves the existing
  // Member row + all RSVP/engagement history — a GUEST becomes APPROVED in place.
  const resolved = await resolveMember({
    workspaceId,
    email: app.email,
    name: app.fullName,
    clerkUserId: `applicant:${app.id}`,
    phone: app.phone ?? undefined,
    source: 'approval',
  });

  const [application, member] = await db.$transaction([
    db.application.update({
      where: { id: applicationId },
      data: {
        status: 'APPROVED',
        reviewedAt: now,
        reviewedBy: actorId,
        reviewNote: reviewNote ?? null,
        memberId: resolved.id,
      },
    }),
    db.member.update({
      where: { id: resolved.id },
      data: { status: MemberStatus.APPROVED, approved: true, approvedAt: now },
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
    engagement: { memberId: member.id, eventType: 'application_approved', eventId: applicationId },
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
