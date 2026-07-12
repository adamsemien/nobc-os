/** Consent derivation + promotion-time merge (consent reconciliation, Phase 1).
 *
 *  Consent signals live in two legacy places — Application (`emailOptIn` /
 *  `smsOptInAt`) and the Member marketing booleans. This module DERIVES a
 *  signal from them and routes it through THE single consent writer
 *  (lib/comms/consent-writer.ts), which reads the person-keyed canonical rows
 *  first, merges under the locked conflict rule (most protective explicit
 *  signal wins — the old "no-downgrade" special case is subsumed by it), and
 *  converges every keying: person row, member mirror rows, Member booleans.
 *
 *  ADDITIVE LAW: the legacy columns are NOT dropped; they are writer-maintained
 *  mirrors, deprecated as a read path (locked decision 3).
 *
 *  Fire-and-forget safe: like logEngagementEvent, this never throws and never
 *  blocks the request path. Before the migration runs (ChannelSubscription table
 *  absent) it degrades to a logged no-op.
 */
import type { CommChannel, ConsentBasis, SubscriptionStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { writeConsent } from '@/lib/comms/consent-writer';

export type ConsentContext =
  | 'member_create'
  | 'guest_create'
  | 'import'
  | 'application_approval'
  | 'operator_manual'
  | 'backfill';

const CHANNELS: CommChannel[] = ['EMAIL', 'SMS'];

type DerivedSignal = {
  status: Extract<SubscriptionStatus, 'SUBSCRIBED' | 'PENDING'>;
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
 * Reconcile a member's consent state from current legacy signals — the
 * promotion-time merge. Fires on member/guest creation, import, and
 * application approval. Derives the incoming signal from the Member booleans +
 * latest Application, then hands it to writeConsent in 'merge' mode: the
 * writer reads the person-keyed rows first and the locked conflict rule
 * decides (most protective explicit signal wins — replacing the old
 * "no-downgrade" rule). Idempotent, safe to run repeatedly.
 */
export async function syncMemberChannelConsent(args: {
  workspaceId: string;
  memberId: string;
  /** Optional hint; the writer re-resolves the member's personId itself, so
   *  callers without a resolved Person just omit it. */
  personId?: string | null;
  context: ConsentContext;
}): Promise<void> {
  try {
    const member = await db.member.findUnique({
      where: { id: args.memberId },
      select: {
        id: true,
        workspaceId: true,
        personId: true,
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
      await writeConsent({
        workspaceId: args.workspaceId,
        memberId: args.memberId,
        personId: args.personId ?? member.personId ?? null,
        signal: {
          channel,
          status: signal.status,
          basis: signal.basis,
          source: signal.source === 'none' ? null : `${signal.source}:${args.context}`,
          at: signal.at,
        },
        mode: 'merge',
        context: args.context,
      });
    }
  } catch (err) {
    // Degrades to a logged no-op until the ChannelSubscription table is migrated.
    console.error(
      `[consent-sync] syncMemberChannelConsent failed (member=${args.memberId} workspace=${args.workspaceId} context=${args.context}):`,
      err,
    );
  }
}
