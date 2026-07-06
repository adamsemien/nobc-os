/** Consent unification (CRM substrate, Phase 1).
 *
 *  Consent currently lives in two places that never sync — Application
 *  (`agreedToMembershipTerms` / `emailOptIn` / `smsOptInAt`) and Member marketing
 *  booleans (`marketingEmailOptIn` / `marketingSmsOptIn`). This writer makes both
 *  INPUTS that derive ChannelSubscription rows, so ChannelSubscription becomes the
 *  single read for "may we message this person on this channel" (via canSend).
 *
 *  ADDITIVE LAW: the legacy columns are NOT dropped and NOT stopped-being-written;
 *  they simply stop being the read for send decisions. This writer only ever
 *  ELEVATES consent (creates a row, or upgrades toward SUBSCRIBED). It NEVER
 *  downgrades a SUBSCRIBED row — unsubscribe is a separate, explicit action.
 *
 *  Fire-and-forget safe: like logEngagementEvent, this never throws and never
 *  blocks the request path. Before the migration runs (ChannelSubscription table
 *  absent) it degrades to a logged no-op.
 */
import type { CommChannel, ConsentBasis, SubscriptionStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { logEngagementEvent } from '@/lib/engagement';

export type ConsentContext =
  | 'member_create'
  | 'application_approval'
  | 'operator_manual'
  | 'backfill';

const CHANNELS: CommChannel[] = ['EMAIL', 'SMS'];

type DerivedSignal = {
  status: SubscriptionStatus;
  basis: ConsentBasis;
  source: string;
  at: Date | null;
};

/**
 * Derive the consent signal for one channel from the inputs available in Phase 1.
 *
 * Precedence (strongest explicit opt-in wins):
 *   1. Member marketing boolean (checkout / profile affirmative opt-in) -> EXPRESS_OPTIN
 *   2. Latest Application opt-in (the pre-rebuild signal)               -> EXPRESS_OPTIN
 *   3. [Phase 2] NewsletterSubscriber / Beehiiv                         -> EXPRESS_OPTIN  (see TODO)
 *   4. no signal                                                        -> PENDING / UNKNOWN
 *
 * Not derivable from Phase-1 signals and therefore NOT synthesized here (flagged
 * for later, honest-empty per spec decision 5):
 *   - IMPLIED_RELATIONSHIP (event-attendance-without-explicit-opt-in) — there is no
 *     distinct data signal for it today; the checkout marketing booleans ARE explicit
 *     opt-ins (EXPRESS_OPTIN). Reserved for the Phase-2 importer's per-batch basis.
 *   - IMPORTED_LEGACY — set by the Phase-2 importer, never here.
 *   - OPERATOR_ADDED — reserved for a future "operator asserts consent" action; the
 *     current manual-create UI captures no consent, so operator_manual yields PENDING.
 */
function deriveSignal(
  channel: CommChannel,
  member: {
    marketingEmailOptIn: boolean;
    marketingEmailOptInAt: Date | null;
    marketingSmsOptIn: boolean;
    marketingSmsOptInAt: Date | null;
  },
  latestApplication: { emailOptIn: boolean; emailOptInAt: Date | null; smsOptInAt: Date | null } | null,
): DerivedSignal {
  if (channel === 'EMAIL') {
    if (member.marketingEmailOptIn) {
      return { status: 'SUBSCRIBED', basis: 'EXPRESS_OPTIN', source: 'member_profile', at: member.marketingEmailOptInAt };
    }
    if (latestApplication?.emailOptIn) {
      return { status: 'SUBSCRIBED', basis: 'EXPRESS_OPTIN', source: 'application', at: latestApplication.emailOptInAt };
    }
  } else {
    if (member.marketingSmsOptIn) {
      return { status: 'SUBSCRIBED', basis: 'EXPRESS_OPTIN', source: 'member_profile', at: member.marketingSmsOptInAt };
    }
    if (latestApplication?.smsOptInAt != null) {
      return { status: 'SUBSCRIBED', basis: 'EXPRESS_OPTIN', source: 'application', at: latestApplication.smsOptInAt };
    }
  }

  // TODO(phase-2, decision 1): NewsletterSubscriber / Beehiiv is the third input
  // signal — a subscriber active on the newsletter -> { SUBSCRIBED, EXPRESS_OPTIN,
  // source: 'beehiiv' } for EMAIL. The NewsletterSubscriber model does NOT exist
  // yet (it lands with Phase-2 ingestion); wiring it here now would cross the scope
  // fence. When it exists, read it as the next branch above, same shape.

  return { status: 'PENDING', basis: 'UNKNOWN', source: 'none', at: null };
}

/**
 * Reconcile a member's ChannelSubscription rows from current consent signals.
 * Fires on member creation and application approval (and operator manual create).
 * Idempotent + no-downgrade, so it is safe to run repeatedly.
 */
export async function syncMemberChannelConsent(args: {
  workspaceId: string;
  memberId: string;
  /** Person spine (Phase 2A, scoped unfreeze): written ALONGSIDE memberId on
   *  ChannelSubscription rows. Optional — callers without a resolved Person
   *  omit it and the backfill/next sync fills it. */
  personId?: string | null;
  context: ConsentContext;
}): Promise<void> {
  try {
    const member = await db.member.findUnique({
      where: { id: args.memberId },
      select: {
        id: true,
        workspaceId: true,
        marketingEmailOptIn: true,
        marketingEmailOptInAt: true,
        marketingSmsOptIn: true,
        marketingSmsOptInAt: true,
      },
    });
    // Workspace-scope the write to the resolved member's own workspace.
    if (!member || member.workspaceId !== args.workspaceId) return;

    const latestApplication = await db.application.findFirst({
      where: { workspaceId: args.workspaceId, memberId: args.memberId },
      orderBy: { createdAt: 'desc' },
      select: { emailOptIn: true, emailOptInAt: true, smsOptInAt: true },
    });

    for (const channel of CHANNELS) {
      const signal = deriveSignal(channel, member, latestApplication);

      const existing = await db.channelSubscription.findUnique({
        where: {
          workspaceId_memberId_channel_stream: {
            workspaceId: args.workspaceId,
            memberId: args.memberId,
            channel,
            stream: '*',
          },
        },
        select: { id: true, status: true, personId: true },
      });

      // No-downgrade: never touch an already-SUBSCRIBED row, and never overwrite an
      // existing row with a weaker (PENDING) signal.
      if (existing) {
        if (existing.status === 'SUBSCRIBED') continue;
        if (signal.status !== 'SUBSCRIBED') continue;
        await db.channelSubscription.update({
          where: { id: existing.id },
          data: {
            status: 'SUBSCRIBED',
            consentBasis: signal.basis,
            consentSource: `${signal.source}:${args.context}`,
            consentAt: signal.at,
            syncedAt: new Date(),
            // Person spine (Phase 2A): fill when absent, never overwrite.
            ...(args.personId && !existing.personId ? { personId: args.personId } : {}),
          },
        });
        void logEngagementEvent({
          workspaceId: args.workspaceId,
          memberId: args.memberId,
          eventType: 'channel_subscribed',
          metadata: { channel, basis: signal.basis, source: signal.source, context: args.context },
        });
        continue;
      }

      await db.channelSubscription.create({
        data: {
          workspaceId: args.workspaceId,
          memberId: args.memberId,
          // Person spine (Phase 2A): parallel pointer alongside memberId.
          personId: args.personId ?? null,
          channel,
          stream: '*',
          status: signal.status,
          consentBasis: signal.basis,
          consentSource: signal.source === 'none' ? null : `${signal.source}:${args.context}`,
          consentAt: signal.at,
          syncedAt: new Date(),
        },
      });
      if (signal.status === 'SUBSCRIBED') {
        void logEngagementEvent({
          workspaceId: args.workspaceId,
          memberId: args.memberId,
          eventType: 'channel_subscribed',
          metadata: { channel, basis: signal.basis, source: signal.source, context: args.context },
        });
      }
    }
  } catch (err) {
    // Degrades to a logged no-op until the ChannelSubscription table is migrated.
    console.error(
      `[consent-sync] syncMemberChannelConsent failed (member=${args.memberId} workspace=${args.workspaceId} context=${args.context}):`,
      err,
    );
  }
}
