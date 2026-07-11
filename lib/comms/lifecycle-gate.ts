/** Suppression gate for lifecycle (transactional) event-comms email.
 *
 *  Every event-lifecycle send (registration confirmation, pre-event reminder,
 *  day-of reminder, post-event follow-up) calls `gateLifecycleEmail` BEFORE
 *  sending. The gate is the SuppressionEntry floor only:
 *
 *   - SuppressionEntry is keyed by raw identifier (workspace + channel + email),
 *     the one consent signal that survives the Person/Member promotion gap, so
 *     it is checked unconditionally, transactional or not.
 *   - Beyond suppression, lifecycle email stays transactional-exempt (same
 *     policy as sendTemplatedEmail, see lib/email.ts) — no marketing-consent
 *     gate here.
 *   - FAIL CLOSED: no destination, suppressed, or an error during the lookup
 *     all mean "do not send." This is the opposite of evaluateConsent's
 *     fail-open, on purpose: a skipped lifecycle email is recoverable, a send
 *     to a suppressed address is not.
 *   - `evaluateConsent` is invoked in shadow/log-only mode purely to keep
 *     contributing signal for the Phase-2 ChannelSubscription cutover. Its
 *     verdict is DISCARDED — it can never block or allow a lifecycle send
 *     (transactional keys must never be muted by marketing consent).
 */
import type { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/lib/db';
import { channelIdentifier, evaluateConsent } from '@/lib/comms/can-send';

export type LifecycleGateInput = {
  workspaceId: string;
  email: string | null | undefined;
  /** When known, enables the shadow-mode evaluateConsent probe (log-only). */
  memberId?: string | null;
  /** Send-site label for logs, e.g. 'rsvp.confirmation'. */
  site: string;
};

export type LifecycleGateResult =
  | { send: true; email: string }
  | { send: false; reason: 'no_destination' | 'suppressed' | 'suppression_check_failed' };

export async function gateLifecycleEmail(
  input: LifecycleGateInput,
  db: PrismaClient = defaultDb,
): Promise<LifecycleGateResult> {
  // Same normalization suppression writes use, so a lookup always matches.
  const email = channelIdentifier({ email: input.email }, 'EMAIL');
  if (!email) return { send: false, reason: 'no_destination' };

  try {
    const suppressed = await db.suppressionEntry.findUnique({
      where: {
        workspaceId_channel_identifier: {
          workspaceId: input.workspaceId,
          channel: 'EMAIL',
          identifier: email,
        },
      },
      select: { reason: true },
    });
    if (suppressed) {
      console.info(
        `[lifecycle-gate] site=${input.site} ws=${input.workspaceId} BLOCKED suppressed(${suppressed.reason})`,
      );
      return { send: false, reason: 'suppressed' };
    }
  } catch (err) {
    console.error(
      `[lifecycle-gate] site=${input.site} ws=${input.workspaceId} suppression lookup FAILED (fail-closed: not sending):`,
      err,
    );
    return { send: false, reason: 'suppression_check_failed' };
  }

  // Shadow probe only — evaluateConsent never throws, and its result is
  // intentionally ignored (see header). Not awaited: it must never delay a send.
  if (input.memberId) {
    void evaluateConsent(
      {
        workspaceId: input.workspaceId,
        member: { id: input.memberId, email },
        channel: 'EMAIL',
        site: `lifecycle:${input.site}`,
      },
      db,
    );
  }

  return { send: true, email };
}
