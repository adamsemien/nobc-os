/** Recipient resolution for one event's blast (Stage 18).
 *
 *  The dry run IS this resolution - the send route re-runs the same function
 *  so what the operator confirmed is what fires. Scope: the event's
 *  CONFIRMED attendees, nothing else (no segments, no lists).
 *
 *  Verdict order, most fundamental first:
 *   1. no destination (no email / no phone on file) - unreachable regardless
 *   2. no consent (profile + latest-application fallback both silent)
 *   3. suppressed (the workspace do-not-contact list)
 *   4. QUEUED
 *
 *  redListed is never selected, never read: ACCESS never touches CHANNEL.
 *  Two attendees sharing an inbox both receive their own message - per-
 *  attendee messaging does not dedupe destinations (documented choice).
 */
import type { BlastChannel, PrismaClient } from "@prisma/client";
import {
  emailConsent,
  smsConsent,
  type ConsentSource,
} from "./consent";

export type RecipientVerdictStatus =
  | "QUEUED"
  | "SKIPPED_NO_CONSENT"
  | "SKIPPED_SUPPRESSED"
  | "SKIPPED_NO_DESTINATION";

export type RecipientVerdict = {
  rsvpId: string;
  memberId: string | null;
  name: string;
  destination: string | null;
  status: RecipientVerdictStatus;
  consentSource: ConsentSource | null;
  /** Operator-facing skip reason for the dry-run table. Null when queued. */
  reason: string | null;
};

export type BlastResolution = {
  verdicts: RecipientVerdict[];
  counts: {
    total: number;
    queued: number;
    noConsent: number;
    noDestination: number;
    suppressed: number;
  };
};

export async function resolveBlastRecipients(
  db: PrismaClient,
  args: { workspaceId: string; eventId: string; channel: BlastChannel },
): Promise<BlastResolution> {
  const rsvps = await db.rSVP.findMany({
    where: {
      workspaceId: args.workspaceId,
      eventId: args.eventId,
      ticketStatus: "confirmed",
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      guestEmail: true,
      guestName: true,
      member: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          marketingEmailOptIn: true,
          marketingSmsOptIn: true,
          // Deliberately NOT selected: redListed. ACCESS never touches CHANNEL.
        },
      },
    },
  });

  const memberIds = [...new Set(rsvps.map((r) => r.member.id))];
  // Latest application per member - the pre-rebuild consent fallback.
  const applications = await db.application.findMany({
    where: { workspaceId: args.workspaceId, memberId: { in: memberIds } },
    orderBy: { createdAt: "desc" },
    select: { memberId: true, emailOptIn: true, smsOptInAt: true },
  });
  const latestByMember = new Map<
    string,
    { emailOptIn: boolean; smsOptInAt: Date | null }
  >();
  for (const app of applications) {
    if (app.memberId && !latestByMember.has(app.memberId)) {
      latestByMember.set(app.memberId, {
        emailOptIn: app.emailOptIn,
        smsOptInAt: app.smsOptInAt,
      });
    }
  }

  const suppressedRows = await db.suppressedContact.findMany({
    where: { workspaceId: args.workspaceId, channel: args.channel },
    select: { destination: true },
  });
  const suppressed = new Set(
    suppressedRows.map((s) => s.destination.trim().toLowerCase()),
  );

  const verdicts: RecipientVerdict[] = rsvps.map((rsvp) => {
    const member = rsvp.member;
    const name =
      rsvp.guestName?.trim() ||
      `${member.firstName} ${member.lastName}`.trim() ||
      "Guest";
    const destination =
      args.channel === "EMAIL"
        ? member.email.trim() || rsvp.guestEmail?.trim() || null
        : member.phone?.trim() || null;

    const base = {
      rsvpId: rsvp.id,
      memberId: member.id,
      name,
      destination,
    };
    if (!destination) {
      return {
        ...base,
        status: "SKIPPED_NO_DESTINATION" as const,
        consentSource: null,
        reason: args.channel === "SMS" ? "No phone on file" : "No email on file",
      };
    }
    const latestApp = latestByMember.get(member.id) ?? null;
    const consent =
      args.channel === "EMAIL"
        ? emailConsent(member, latestApp)
        : smsConsent(member, latestApp);
    if (!consent.ok) {
      return {
        ...base,
        status: "SKIPPED_NO_CONSENT" as const,
        consentSource: null,
        reason: "No marketing consent on file",
      };
    }
    if (suppressed.has(destination.trim().toLowerCase())) {
      return {
        ...base,
        status: "SKIPPED_SUPPRESSED" as const,
        consentSource: null,
        reason: "On the do-not-contact list",
      };
    }
    return {
      ...base,
      status: "QUEUED" as const,
      consentSource: consent.source,
      reason: null,
    };
  });

  const count = (s: RecipientVerdictStatus) =>
    verdicts.filter((v) => v.status === s).length;
  return {
    verdicts,
    counts: {
      total: verdicts.length,
      queued: count("QUEUED"),
      noConsent: count("SKIPPED_NO_CONSENT"),
      noDestination: count("SKIPPED_NO_DESTINATION"),
      suppressed: count("SKIPPED_SUPPRESSED"),
    },
  };
}

/** The confirm sentence: "Sending to 42 of 61 attendees (19 skipped: ...)". */
export function confirmSentence(counts: BlastResolution["counts"]): string {
  const skipped = counts.total - counts.queued;
  if (skipped === 0) {
    return `Sending to all ${counts.total} attendees.`;
  }
  const parts: string[] = [];
  if (counts.noConsent > 0) parts.push(`${counts.noConsent} no consent`);
  if (counts.noDestination > 0) {
    parts.push(`${counts.noDestination} unreachable`);
  }
  if (counts.suppressed > 0) parts.push(`${counts.suppressed} suppressed`);
  return `Sending to ${counts.queued} of ${counts.total} attendees (${skipped} skipped: ${parts.join(", ")}).`;
}
