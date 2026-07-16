/** Application approval — THE one approve path. Shared by the operator API
 *  route, the agent `applications.approve` tool, AND the MCP
 *  `nobc_approve_application` tool (whose duplicated local implementation was
 *  deleted 2026-07-11 — the earlier "identical logic" claim here was only true
 *  for the first two): flip status → APPROVED, resolve + promote the Member in
 *  place, sync channel consent, fire wallet pass + welcome email, emit audit
 *  events. */
import { MemberStatus, type Application, type AuditActorType, type Member } from '@prisma/client';
import { db } from '@/lib/db';
import { promoteApplicationScalars, type PromotedScalars } from '@/lib/apply/promote-answers';
import { resolveMember } from '@/lib/member-identity';
import { ACTIVE_EVENT_ID } from '@/lib/active-event';
import { emitEvent } from '@/lib/emit-event';
import { syncMemberChannelConsent } from '@/lib/comms/consent-sync';
import { welcomeEmail } from '@/lib/email-templates';
import { generateMemberPass } from '@/lib/wallet-pass';
import { resend } from '@/lib/resend';

export type ApproveOutcome =
  | { ok: true; application: Application; member: Member }
  | { ok: false; error: 'not_found' | 'forbidden' | 'already_approved' | 'not_submitted' };

export async function approveApplication(params: {
  applicationId: string;
  workspaceId: string;
  actorId: string;
  actorType?: AuditActorType;
  reviewNote?: string;
  // Data Integrity Build A: an application with submittedAt === null was never
  // submitted (draft-only). Approving one is blocked by default - an operator can
  // still do it deliberately by passing this flag, which only the single-approve
  // route exposes (behind its own explicit confirmation step). Bulk approve and the
  // MCP/agent tool never pass this - a fat-fingered bulk select or an agent call
  // must never silently override the guard.
  allowUnsubmitted?: boolean;
}): Promise<ApproveOutcome> {
  const { applicationId, workspaceId, actorId, actorType, reviewNote, allowUnsubmitted } = params;

  const app = await db.application.findUnique({ where: { id: applicationId } });
  if (!app) return { ok: false, error: 'not_found' };
  if (app.workspaceId !== workspaceId) return { ok: false, error: 'forbidden' };
  if (app.status === 'APPROVED') return { ok: false, error: 'already_approved' };
  if (app.submittedAt === null && !allowUnsubmitted) return { ok: false, error: 'not_submitted' };

  const now = new Date();

  // Scalar promotion (read path): approval must not depend on the typed
  // columns being fresh — promote from ApplicationAnswer at decision time
  // (heals the row) and use the promoted contact values below. Fail-soft:
  // enrichment must never fail the approval.
  let promoted: PromotedScalars = { phone: null, city: null, zip: null };
  try {
    promoted = await promoteApplicationScalars(app.id);
  } catch (err) {
    console.error(`[approve] scalar promotion failed for application ${app.id}:`, err);
  }
  const applicantPhone = promoted.phone ?? app.phone ?? undefined;

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
    phone: applicantPhone,
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

  // Contact enrichment (read path, fill-if-empty only): resolveMember writes
  // phone ONLY when it mints a new Member — the existing-member path (the
  // normal case, since Door 1 mints the GUEST at submit) drops it. Fill the
  // Member row here, and carry phone + home ZIP onto the Person spine
  // (Person.postalCode is otherwise written only by the SMS opt-in page —
  // fill-if-empty never fights it). Never fails the approval.
  try {
    if (applicantPhone) {
      await db.member.updateMany({
        where: { id: member.id, OR: [{ phone: null }, { phone: '' }] },
        data: { phone: applicantPhone },
      });
    }
    const personId = app.personId ?? member.personId;
    if (personId && (applicantPhone || promoted.zip)) {
      const person = await db.person.findUnique({
        where: { id: personId },
        select: { phone: true, postalCode: true },
      });
      if (person) {
        const personFill: { phone?: string; postalCode?: string } = {};
        if (applicantPhone && !person.phone) personFill.phone = applicantPhone;
        if (promoted.zip && !person.postalCode) personFill.postalCode = promoted.zip;
        if (Object.keys(personFill).length > 0) {
          await db.person.update({ where: { id: personId }, data: personFill });
        }
      }
    }
  } catch (err) {
    console.error(`[approve] contact enrichment failed for application ${app.id}:`, err);
  }

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

  // Consent floor (CRM substrate, Phase 1): reconcile ChannelSubscription from the
  // applicant's opt-ins (Application emailOptIn / smsOptInAt -> EXPRESS_OPTIN).
  // Fire-and-forget + no-downgrade; the legacy consent columns are untouched.
  void syncMemberChannelConsent({ workspaceId, memberId: member.id, context: 'application_approval' });

  // Door 1: confirm the application-issued comp RSVP for the active event. The
  // comp was minted pending_approval on apply-submit; approving confirms the
  // free ticket. Fail-closed — a missing comp or any error is logged, never
  // throws, and never blocks the approval.
  try {
    const compRsvp = await db.rSVP.findFirst({
      where: {
        workspaceId,
        eventId: ACTIVE_EVENT_ID,
        memberId: member.id,
        isComp: true,
        compType: 'APPLICATION',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, ticketStatus: true },
    });
    if (compRsvp) {
      if (compRsvp.ticketStatus !== 'confirmed') {
        await db.rSVP.update({
          where: { id: compRsvp.id },
          data: { ticketStatus: 'confirmed' },
        });
      }
    } else {
      console.warn(
        `[door1-comp] approve: no application comp RSVP for member ${member.id} / event ${ACTIVE_EVENT_ID}`,
      );
    }
  } catch (err) {
    console.error('[door1-comp] approve: confirm failed:', err);
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
      .send({ from: 'The No Bad Company <team@thenobadcompany.com>', to: app.email, subject, html })
      .catch((err) => console.error('[approve] email failed:', err));
  }

  return { ok: true, application, member };
}
