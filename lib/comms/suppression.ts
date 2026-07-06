/** Suppression writes (CRM substrate, Phase 1) — the CHANNEL axis.
 *
 *  LOCKED LAW (spec §1): the ACCESS axis and the CHANNEL axis are orthogonal and
 *  must NEVER be conflated.
 *    - ACCESS  = redListed / RedList / WatchList PURPLE / VIP  ->  "can this
 *      person enter." AC's "Red List" is a VIP flag, NOT a block.
 *    - CHANNEL = SuppressionEntry / ChannelSubscription        ->  "may we message
 *      this identifier."
 *  A "Red List" / VIP / PURPLE tag must NEVER create a SuppressionEntry or map to
 *  Member.redListed via a messaging path. This module is the write boundary that
 *  enforces it: every SuppressionEntry is minted here, through the validator.
 */
import type { CommChannel, PrismaClient, SuppressionReason } from '@prisma/client';
import { db as defaultDb } from '@/lib/db';
import { channelIdentifier } from '@/lib/comms/can-send';
import { logEngagementEvent } from '@/lib/engagement';

/** Access-axis vocabulary that must never leak into a channel suppression. */
const ACCESS_AXIS_PATTERN = /\b(red[\s_-]*list(ed)?|vip|purple|watch[\s_-]*list)\b/i;

export class AccessAxisSuppressionError extends Error {
  constructor(offending: string) {
    super(
      `Refusing to create a SuppressionEntry from an ACCESS-axis concept ("${offending}"). ` +
        `Red List / VIP / WatchList PURPLE gate ENTRY, not messaging — the CHANNEL and ` +
        `ACCESS axes must never be conflated (spec §1).`,
    );
    this.name = 'AccessAxisSuppressionError';
  }
}

/**
 * The naming-collision guard. Throws if a suppression's provenance (`source` or
 * `note`) carries ACCESS-axis vocabulary. Pure — call it from any path that maps
 * tags/labels into suppression (e.g. the Phase-2 ActiveCampaign importer).
 */
export function assertChannelAxisOnly(input: {
  source?: string | null;
  note?: string | null;
}): void {
  const haystack = `${input.source ?? ''} ${input.note ?? ''}`;
  const match = haystack.match(ACCESS_AXIS_PATTERN);
  if (match) throw new AccessAxisSuppressionError(match[0]);
}

export type CreateSuppressionInput = {
  workspaceId: string;
  channel: CommChannel;
  /** Raw email/phone; normalized to match canSend's channelIdentifier. */
  identifier: string;
  reason: SuppressionReason;
  source?: string | null;
  memberId?: string | null;
  /** Person spine (Phase 2A, scoped unfreeze): written ALONGSIDE memberId. */
  personId?: string | null;
  note?: string | null;
};

/**
 * The ONE sanctioned path to create a SuppressionEntry. Runs the naming-collision
 * guard first, normalizes the identifier the same way canSend reads it, then
 * upserts on (workspace, channel, identifier). Emits a suppression_added signal
 * when a member is linked.
 *
 * `reason` is a SuppressionReason (UNSUBSCRIBE / HARD_BOUNCE / CARRIER_REJECT /
 * MANUAL_BLOCK / ...) — all legitimate CHANNEL reasons. There is deliberately no
 * enum value for "red list / VIP": that concept cannot reach this function.
 */
export async function createSuppressionEntry(
  input: CreateSuppressionInput,
  db: PrismaClient = defaultDb,
): Promise<void> {
  assertChannelAxisOnly({ source: input.source, note: input.note });

  const identifier =
    channelIdentifier({ email: input.identifier, phone: input.identifier }, input.channel) ??
    input.identifier.trim();

  await db.suppressionEntry.upsert({
    where: {
      workspaceId_channel_identifier: {
        workspaceId: input.workspaceId,
        channel: input.channel,
        identifier,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      channel: input.channel,
      identifier,
      reason: input.reason,
      source: input.source ?? null,
      memberId: input.memberId ?? null,
      personId: input.personId ?? null,
      note: input.note ?? null,
    },
    update: {},
  });

  if (input.memberId) {
    void logEngagementEvent({
      workspaceId: input.workspaceId,
      memberId: input.memberId,
      eventType: 'suppression_added',
      metadata: { channel: input.channel, reason: input.reason, source: input.source ?? null },
    });
  }
}
