/** Purchase confirmation email (Event Builder Rebuild, Phase F - ADD 2).
 *
 *  Sent directly at the Order-write site (the addendum's sanctioned fallback,
 *  chosen deliberately): for gate purchases the Stripe webhook can never
 *  email - either the RSVP row does not exist yet when the event arrives, or
 *  it is already CAPTURED and the webhook's first-confirmation guard skips
 *  it - so this direct send is both required and double-send-safe. Comp
 *  admissions have no Stripe event at all.
 *
 *  Reuses the house rsvpConfirmedEmail template (event name, date, location,
 *  the ticket reference, and the link back to the event page where the
 *  ticket lives) and the locked from address. A send failure logs + alerts
 *  but never fails the purchase.
 */
import type { PrismaClient } from "@prisma/client";
import { alert } from "@/lib/alerting";
import { rsvpConfirmedEmail } from "@/lib/email-templates";
import { resend } from "@/lib/resend";

export async function sendTicketConfirmation(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    memberId: string;
    rsvpId: string;
  },
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const [event, member] = await Promise.all([
      db.event.findFirst({
        where: { id: args.eventId, workspaceId: args.workspaceId },
        select: { title: true, slug: true, startAt: true, location: true },
      }),
      db.member.findFirst({
        where: { id: args.memberId, workspaceId: args.workspaceId },
        select: { email: true, firstName: true, memberQrCode: true },
      }),
    ]);
    if (!event?.startAt || !member?.email) return;

    const { subject, html } = rsvpConfirmedEmail(
      member.firstName || "there",
      event.title,
      event.startAt,
      event.location,
      event.slug,
      args.rsvpId,
      Boolean(member.memberQrCode),
    );
    await resend.emails.send({
      from: "The No Bad Company <team@thenobadcompany.com>",
      to: member.email,
      subject,
      html,
    });
  } catch (err) {
    console.error("[confirmation] ticket confirmation send failed", {
      workspaceId: args.workspaceId,
      rsvpId: args.rsvpId,
      error: err instanceof Error ? err.message : String(err),
    });
    void alert({
      severity: "error",
      event: "gate.confirmation_email_failed",
      workspaceId: args.workspaceId,
      context: { rsvpId: args.rsvpId, eventId: args.eventId },
    });
  }
}
