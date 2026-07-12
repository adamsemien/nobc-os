/** THE consent writer (consent reconciliation, Phase 1).
 *
 *  Every ChannelSubscription mutation goes through `writeConsent` — the sync
 *  deriver (lib/comms/consent-sync.ts), the operator Person consent route, the
 *  gate checkout opt-in, and the creation-path PENDING seeds all call it.
 *  One call atomically converges every keying of one human's consent state:
 *
 *    1. the person-keyed canonical row  (personId set, memberId NULL) — the
 *       authority (locked decision 1) whenever a Person exists;
 *    2. the member-keyed mirror row(s)  — one per Member linked to that Person
 *       (a Member with no Person gets a member-keyed row only, until a Person
 *       exists);
 *    3. the Member marketing booleans   (marketingEmailOptIn / marketingSmsOptIn
 *       + their *At stamps) — writer-maintained mirrors, deprecated as a read
 *       path, kept forever (locked decision 3).
 *
 *  CONFLICT RULE (locked decision 4 — governs every merge point):
 *    most protective explicit signal wins.
 *      Suppression (separate table, never written here)
 *        > explicit UNSUBSCRIBED (CLEANED sits in this tier: an ESP-recorded
 *          negative is as protective as an unsubscribe)
 *        > explicit opt-in (SUBSCRIBED)
 *        > no signal (PENDING / NEVER_SUBSCRIBED / no row).
 *    A default-false boolean is ABSENCE of signal, not refusal — creation paths
 *    seed PENDING, never UNSUBSCRIBED. Recency breaks ties only within a tier;
 *    a missing timestamp never wins a tie. Ambiguity never resolves to send.
 *
 *  MODES: 'merge' applies the conflict rule (derived signals, imports,
 *  backfills, promotion-time syncs). 'explicit' is a fresh first-party signal
 *  expressed NOW (operator panel action, a checked checkout box) — it sets the
 *  state directly; a later explicit re-subscribe may lawfully follow an
 *  unsubscribe. Neither mode ever touches SuppressionEntry: suppression is the
 *  hard floor (lib/comms/suppression.ts mints it; canSend + the lifecycle gate
 *  read it) and an operator Unsubscribe never mints one (locked decision 2).
 */
import type {
  CommChannel,
  ConsentBasis,
  Prisma,
  PrismaClient,
  SubscriptionStatus,
} from '@prisma/client';
import { db as defaultDb } from '@/lib/db';
import { logEngagementEvent } from '@/lib/engagement';

export type ConsentWriteMode = 'merge' | 'explicit';

export type ConsentSignal = {
  channel: CommChannel;
  /** Writers only ever express these three; CLEANED/NEVER_SUBSCRIBED are
   *  read-side states (imports may land them in Phase 3+, through merge). */
  status: Extract<SubscriptionStatus, 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'PENDING'>;
  basis: ConsentBasis;
  /** Provenance, e.g. 'member_profile:application_approval', 'operator_manual'. */
  source: string | null;
  /** When the signal was expressed. Missing timestamps never win a same-tier tie. */
  at: Date | null;
};

export type ConsentState = {
  status: SubscriptionStatus;
  at: Date | null;
  basis: ConsentBasis;
  source: string | null;
};

/** Protection tiers of the locked conflict rule. Suppression is tier 3 but
 *  lives in its own table and is never decided here. */
const TIER: Record<SubscriptionStatus, number> = {
  UNSUBSCRIBED: 2,
  CLEANED: 2,
  SUBSCRIBED: 1,
  PENDING: 0,
  NEVER_SUBSCRIBED: 0,
};

/** The conflict rule as a pure function: which state stands.
 *  merge: higher tier wins; same tier → newer `at` wins; a missing incoming
 *  timestamp never displaces an existing state (ambiguity never resolves to
 *  send — and never silently flips an explicit state either).
 *  explicit: the incoming signal is a fresh first-party expression; it stands. */
export function resolveConsentConflict(
  existing: Pick<ConsentState, 'status' | 'at'> | null,
  incoming: Pick<ConsentState, 'status' | 'at'>,
  mode: ConsentWriteMode,
): 'incoming' | 'existing' {
  if (!existing) return 'incoming';
  if (mode === 'explicit') return 'incoming';
  const existingTier = TIER[existing.status];
  const incomingTier = TIER[incoming.status];
  if (incomingTier > existingTier) return 'incoming';
  if (incomingTier < existingTier) return 'existing';
  if (
    incoming.at != null &&
    (existing.at == null || incoming.at.getTime() > existing.at.getTime())
  ) {
    return 'incoming';
  }
  return 'existing';
}

/** Fold a set of stored rows to the one effective state under the conflict
 *  rule — the most protective, recency-tie-broken state across keyings. */
export function mostProtective(states: ConsentState[]): ConsentState | null {
  let winner: ConsentState | null = null;
  for (const state of states) {
    if (!winner || resolveConsentConflict(winner, state, 'merge') === 'incoming') {
      winner = state;
    }
  }
  return winner;
}

export type WriteConsentArgs = {
  workspaceId: string;
  /** At least one of memberId / personId. The writer resolves the full
   *  identity cluster (the Person + every Member pointing at it) itself. */
  memberId?: string | null;
  personId?: string | null;
  signal: ConsentSignal;
  mode: ConsentWriteMode;
  /** Caller label for engagement metadata, e.g. 'application_approval'. */
  context: string;
};

export type WriteConsentResult = {
  /** True when the effective status changed (not just a missing keying filled). */
  changed: boolean;
  status: SubscriptionStatus;
};

const STREAM = '*';

/** Atomically converge every keying of one human's consent for one channel.
 *  Reads person-keyed + member-keyed rows, resolves the winner under the
 *  conflict rule (or takes the explicit signal), then writes the winning state
 *  to the canonical person row, every member mirror row, and the Member
 *  marketing booleans in ONE transaction. Throws on failure — fire-and-forget
 *  callers wrap it (consent-sync catches; routes surface the error). */
export async function writeConsent(
  args: WriteConsentArgs,
  db: PrismaClient = defaultDb,
): Promise<WriteConsentResult> {
  const { workspaceId, signal, mode } = args;

  // ── Resolve the identity cluster (workspace-scoped) ────────────────────────
  let personId = args.personId ?? null;
  let memberIds: string[] = [];

  if (personId) {
    const person = await db.person.findFirst({
      where: { id: personId, workspaceId },
      select: { id: true },
    });
    if (!person) throw new Error(`writeConsent: person not in workspace (${personId})`);
    const members = await db.member.findMany({
      where: { workspaceId, personId },
      select: { id: true },
    });
    memberIds = members.map((m) => m.id);
    if (args.memberId && !memberIds.includes(args.memberId)) {
      const member = await db.member.findFirst({
        where: { id: args.memberId, workspaceId },
        select: { id: true },
      });
      if (member) memberIds.push(member.id);
    }
  } else if (args.memberId) {
    const member = await db.member.findFirst({
      where: { id: args.memberId, workspaceId },
      select: { id: true, personId: true },
    });
    if (!member) throw new Error(`writeConsent: member not in workspace (${args.memberId})`);
    personId = member.personId;
    if (personId) {
      const siblings = await db.member.findMany({
        where: { workspaceId, personId },
        select: { id: true },
      });
      memberIds = siblings.map((m) => m.id);
      if (!memberIds.includes(member.id)) memberIds.push(member.id);
    } else {
      memberIds = [member.id];
    }
  } else {
    throw new Error('writeConsent: memberId or personId required');
  }

  // ── Read the existing rows for this channel (person-keyed first) ──────────
  const personRow = personId
    ? await db.channelSubscription.findFirst({
        where: { workspaceId, personId, memberId: null, channel: signal.channel, stream: STREAM },
        select: { id: true, status: true, consentAt: true, consentBasis: true, consentSource: true },
      })
    : null;
  const memberRows = memberIds.length
    ? await db.channelSubscription.findMany({
        where: {
          workspaceId,
          memberId: { in: memberIds },
          channel: signal.channel,
          stream: STREAM,
        },
        select: {
          id: true,
          memberId: true,
          personId: true,
          status: true,
          consentAt: true,
          consentBasis: true,
          consentSource: true,
        },
      })
    : [];

  const toState = (r: {
    status: SubscriptionStatus;
    consentAt: Date | null;
    consentBasis: ConsentBasis;
    consentSource: string | null;
  }): ConsentState => ({
    status: r.status,
    at: r.consentAt,
    basis: r.consentBasis,
    source: r.consentSource,
  });

  const effectiveBefore = mostProtective([
    ...(personRow ? [toState(personRow)] : []),
    ...memberRows.map(toState),
  ]);

  const incomingState: ConsentState = {
    status: signal.status,
    at: signal.at,
    basis: signal.basis,
    source: signal.source,
  };

  const winner =
    resolveConsentConflict(effectiveBefore, incomingState, mode) === 'incoming'
      ? incomingState
      : (effectiveBefore as ConsentState);

  // ── Converge every keying to the winning state, atomically ────────────────
  const now = new Date();
  const rowData = {
    status: winner.status,
    consentBasis: winner.basis,
    consentSource: winner.source,
    consentAt: winner.at,
    syncedAt: now,
  };

  const writes: Prisma.PrismaPromise<unknown>[] = [];

  if (personId) {
    if (!personRow) {
      writes.push(
        db.channelSubscription.create({
          data: {
            workspaceId,
            personId,
            memberId: null,
            channel: signal.channel,
            stream: STREAM,
            ...rowData,
          },
        }),
      );
    } else if (personRow.status !== winner.status || personRow.consentAt?.getTime() !== winner.at?.getTime()) {
      writes.push(db.channelSubscription.update({ where: { id: personRow.id }, data: rowData }));
    }
  }

  for (const memberId of memberIds) {
    const existing = memberRows.find((r) => r.memberId === memberId);
    if (!existing) {
      writes.push(
        db.channelSubscription.create({
          data: {
            workspaceId,
            memberId,
            personId,
            channel: signal.channel,
            stream: STREAM,
            ...rowData,
          },
        }),
      );
    } else if (
      existing.status !== winner.status ||
      existing.consentAt?.getTime() !== winner.at?.getTime() ||
      (personId != null && existing.personId == null)
    ) {
      writes.push(
        db.channelSubscription.update({
          where: { id: existing.id },
          data: {
            ...rowData,
            // Fill the parallel Person pointer when absent; never clear it.
            ...(personId && !existing.personId ? { personId } : {}),
          },
        }),
      );
    }
  }

  // Member boolean mirrors — only when the winning state is an explicit
  // subscribe/unsubscribe. PENDING is absence of signal: it must neither set
  // nor clear a boolean (decision 4: default-false is not refusal).
  if (memberIds.length && (winner.status === 'SUBSCRIBED' || winner.status === 'UNSUBSCRIBED' || winner.status === 'CLEANED')) {
    const subscribed = winner.status === 'SUBSCRIBED';
    writes.push(
      db.member.updateMany({
        where: { id: { in: memberIds }, workspaceId },
        data:
          signal.channel === 'EMAIL'
            ? {
                marketingEmailOptIn: subscribed,
                // Stamp when consent was granted; an unsubscribe keeps the
                // historical grant time (the boolean is the current state).
                ...(subscribed ? { marketingEmailOptInAt: winner.at ?? now } : {}),
              }
            : {
                marketingSmsOptIn: subscribed,
                ...(subscribed ? { marketingSmsOptInAt: winner.at ?? now } : {}),
              },
      }),
    );
  }

  if (writes.length) await db.$transaction(writes);

  const changed = (effectiveBefore?.status ?? null) !== winner.status;
  if (changed && (winner.status === 'SUBSCRIBED' || winner.status === 'UNSUBSCRIBED')) {
    void logEngagementEvent({
      workspaceId,
      memberId: args.memberId ?? memberIds[0] ?? null,
      personId,
      eventType: winner.status === 'SUBSCRIBED' ? 'channel_subscribed' : 'channel_unsubscribed',
      metadata: {
        channel: signal.channel,
        basis: winner.basis,
        source: winner.source,
        context: args.context,
        mode,
      },
    });
  }

  return { changed, status: winner.status };
}
