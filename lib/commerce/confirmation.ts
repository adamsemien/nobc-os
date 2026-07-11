/** Purchase confirmation email (Event Builder Rebuild, Phase F - ADD 2).
 *
 *  Sent directly at the Order-write site (the addendum's sanctioned fallback,
 *  chosen deliberately): for gate purchases the Stripe webhook can never
 *  email - either the RSVP row does not exist yet when the event arrives, or
 *  it is already CAPTURED and the webhook's first-confirmation guard skips
 *  it - so this direct send is both required and double-send-safe. Comp
 *  admissions have no Stripe event at all.
 *
 *  Normalized onto sendTemplatedEmail (event-comms): suppression-gated and
 *  fail-closed via lib/comms/lifecycle-gate.ts, logged to
 *  TransactionalEmailLog. Buyers with a member QR get `rsvp.confirmation_paid`
 *  (inline door QR + ticket link); buyers without one get the standard
 *  `rsvp.confirmation` (ticket link only) - the same two content branches the
 *  legacy rsvpConfirmedEmail carried, now operator-editable. A send failure
 *  logs + alerts but never fails the purchase.
 */
import type { PrismaClient } from "@prisma/client";
import { alert } from "@/lib/alerting";
import { sendTemplatedEmail } from "@/lib/email";
import { gateLifecycleEmail } from "@/lib/comms/lifecycle-gate";

export async function sendTicketConfirmation(
  db: PrismaClient,
  args: {
    workspaceId: string;
    eventId: string;
    memberId: string;
    rsvpId: string;
  },
): Promise<void> {
  try {
    const [event, member] = await Promise.all([
      db.event.findFirst({
        where: { id: args.eventId, workspaceId: args.workspaceId },
        select: { title: true, startAt: true, location: true },
      }),
      db.member.findFirst({
        where: { id: args.memberId, workspaceId: args.workspaceId },
        select: { email: true, firstName: true, memberQrCode: true },
      }),
    ]);
    if (!event?.startAt || !member?.email) return;

    const gate = await gateLifecycleEmail(
      {
        workspaceId: args.workspaceId,
        email: member.email,
        memberId: args.memberId,
        site: "ticket.confirmation",
      },
      db,
    );
    if (!gate.send) {
      console.info(
        `[confirmation] ticket confirmation skipped for rsvp=${args.rsvpId}: ${gate.reason}`,
      );
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.thenobadcompany.com";
    const templateKey = member.memberQrCode ? "rsvp.confirmation_paid" : "rsvp.confirmation";
    const result = await sendTemplatedEmail(
      args.workspaceId,
      templateKey,
      gate.email,
      {
        member: { firstName: member.firstName || "there" },
        event: {
          title: event.title,
          dateFormatted: event.startAt.toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric",
            timeZone: "America/Chicago",
          }),
          timeFormatted: event.startAt.toLocaleTimeString("en-US", {
            hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
          }),
          location: event.location ?? "",
        },
        ticket: { url: `${appUrl}/ticket/${args.rsvpId}` },
        qr: { url: `${appUrl}/api/qr/${encodeURIComponent(args.rsvpId)}` },
      },
      [{ memberId: args.memberId }],
    );
    if (!result.ok) {
      if (result.reason === "send_failed") {
        // Provider failure - the case the alert has always covered.
        throw new Error(result.error ?? "send_failed");
      }
      // disabled / template_missing / no_resend_key: fail-soft by design,
      // already audited inside sendTemplatedEmail.
      console.info(
        `[confirmation] ticket confirmation not sent for rsvp=${args.rsvpId}: ${result.reason}`,
      );
    }
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
