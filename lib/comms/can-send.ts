/** The consent floor (CRM substrate, Phase 1).
 *
 *  `canSend` is THE one canonical send-decision every message path routes
 *  through — suppression floor first (hard block), then ChannelSubscription
 *  status == SUBSCRIBED. Locked in NoBadOS__spec__crm-substrate__2026-07-03.md
 *  §1 (Appendix A). It is a channel-consent guard in the COMMS layer, NOT an
 *  access decision — it must never live in the gate engine (spec §8).
 *
 *  Phase 1 ships in SHADOW MODE: send sites CALL canSend and LOG what it would
 *  decide, but do NOT enforce (do not block). Enforcement flips on AFTER Phase 2
 *  backfills ChannelSubscription rows — enforcing before the backfill would
 *  silently mute every existing comm (no row == not SUBSCRIBED == blocked).
 *  The switch is the SINGLE flag below; there are no per-site conditionals.
 */
import type { CommChannel, PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/lib/db';

export type ConsentEnforcement = 'shadow' | 'enforce';

/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  THE consent-enforcement switch. The ONLY place enforcement is decided.   │
 * │  Phase 1 = 'shadow' (log only, never block).                              │
 * │  To flip to enforce AFTER the Phase 2 backfill: set the env var           │
 * │      COMMS_CONSENT_ENFORCEMENT=enforce                                     │
 * │  (no code change / redeploy of logic needed), or change the fallback      │
 * │  literal here. Do NOT scatter mode checks anywhere else.                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const CONSENT_ENFORCEMENT: ConsentEnforcement =
  process.env.COMMS_CONSENT_ENFORCEMENT === 'enforce' ? 'enforce' : 'shadow';

/** The identifier the suppression floor is keyed on for a channel: email for
 *  EMAIL, phone for SMS. Normalized to match how identifiers are written by
 *  lib/comms/suppression.ts (email lowercased; phone left as-is / E.164). */
export function channelIdentifier(
  member: { email?: string | null; phone?: string | null },
  channel: CommChannel,
): string | null {
  const raw = channel === 'EMAIL' ? member.email : member.phone;
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return channel === 'EMAIL' ? trimmed.toLowerCase() : trimmed;
}

export type CanSendMember = { id: string; email?: string | null; phone?: string | null };

export type CanSendInput = {
  workspaceId: string;
  member: CanSendMember;
  channel: CommChannel;
};

/**
 * THE canonical send-decision (locked, Appendix A). Returns the raw consent
 * verdict — it does NOT consult the shadow/enforce flag (call sites do, via
 * `evaluateConsent`, so the decision is always computed + logged even in shadow).
 *
 *   1. SuppressionEntry for (workspace, channel, identifier) exists  -> false
 *   2. ChannelSubscription (workspace, member, channel, "*") SUBSCRIBED -> true
 *   3. otherwise -> false
 */
export async function canSend(
  input: CanSendInput,
  db: PrismaClient = defaultDb,
): Promise<boolean> {
  const identifier = channelIdentifier(input.member, input.channel);
  if (!identifier) return false; // no destination on this channel

  // 1. Suppression floor (hard block).
  const suppressed = await db.suppressionEntry.findUnique({
    where: {
      workspaceId_channel_identifier: {
        workspaceId: input.workspaceId,
        channel: input.channel,
        identifier,
      },
    },
    select: { id: true },
  });
  if (suppressed) return false;

  // 2. Subscription — the default "*" stream must be SUBSCRIBED.
  const sub = await db.channelSubscription.findUnique({
    where: {
      workspaceId_memberId_channel_stream: {
        workspaceId: input.workspaceId,
        memberId: input.member.id,
        channel: input.channel,
        stream: '*',
      },
    },
    select: { status: true },
  });
  return sub != null && sub.status === 'SUBSCRIBED';
}

export type ConsentDecision = {
  /** The raw canSend verdict. */
  allowed: boolean;
  /** True when the platform is enforcing (CONSENT_ENFORCEMENT === 'enforce'). */
  enforced: boolean;
  /** What the caller should actually do: block ONLY when enforcing AND !allowed.
   *  In shadow mode this is always false — the send proceeds, decision logged. */
  block: boolean;
};

/**
 * Compute canSend, LOG the decision, return whether the caller should block.
 * This is how every send site consults the floor. In shadow mode `block` is
 * always false, so an existing comm is never muted, while the would-be verdict
 * is still logged for the Phase-2 enforcement cutover.
 *
 * Fail-safe (spec §8): any error computing the decision logs and returns
 * block=false — a broken/absent consent table (e.g. before the migration runs)
 * must never mute a send.
 */
export async function evaluateConsent(
  input: CanSendInput & { site: string },
  db: PrismaClient = defaultDb,
): Promise<ConsentDecision> {
  const enforced = CONSENT_ENFORCEMENT === 'enforce';
  try {
    const allowed = await canSend(input, db);
    const block = enforced && !allowed;
    console.info(
      `[canSend:${CONSENT_ENFORCEMENT}] site=${input.site} ws=${input.workspaceId} ` +
        `member=${input.member.id} channel=${input.channel} ` +
        `decision=${allowed ? 'allow' : 'block'}${block ? ' ENFORCED-BLOCK' : ''}`,
    );
    return { allowed, enforced, block };
  } catch (err) {
    console.error(
      `[canSend:${CONSENT_ENFORCEMENT}] site=${input.site} ws=${input.workspaceId} ` +
        `member=${input.member.id} channel=${input.channel} evaluation FAILED (fail-safe: not blocking):`,
      err,
    );
    return { allowed: false, enforced, block: false };
  }
}

/**
 * Shadow probe for a batch of send recipients (e.g. the Blast recipient builder).
 * Evaluates canSend for each and logs a per-blast summary — the highest-signal
 * artifact for the Phase-2 cutover ("canSend would allow N/M; the rest lack a
 * SUBSCRIBED row until the backfill"). Never mutates behavior; guarded.
 */
export async function shadowProbeRecipients(
  args: {
    workspaceId: string;
    channel: CommChannel;
    site: string;
    recipients: CanSendMember[];
  },
  db: PrismaClient = defaultDb,
): Promise<{ total: number; wouldAllow: number; wouldBlock: number }> {
  let wouldAllow = 0;
  for (const member of args.recipients) {
    const { allowed } = await evaluateConsent(
      { workspaceId: args.workspaceId, member, channel: args.channel, site: args.site },
      db,
    );
    if (allowed) wouldAllow += 1;
  }
  const total = args.recipients.length;
  const summary = { total, wouldAllow, wouldBlock: total - wouldAllow };
  console.info(
    `[canSend:${CONSENT_ENFORCEMENT}] site=${args.site} SUMMARY ws=${args.workspaceId} ` +
      `channel=${args.channel} total=${total} wouldAllow=${wouldAllow} wouldBlock=${summary.wouldBlock}`,
  );
  return summary;
}
