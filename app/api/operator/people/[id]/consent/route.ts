import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, type CommChannel, type SubscriptionStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { writeConsent } from '@/lib/comms/consent-writer';
import { createSuppressionEntry } from '@/lib/comms/suppression';
import { channelIdentifier } from '@/lib/comms/can-send';

const CHANNELS: CommChannel[] = ['EMAIL', 'SMS'];
const STATUSES: SubscriptionStatus[] = ['SUBSCRIBED', 'UNSUBSCRIBED'];

/** Person-first consent write path (consent reconciliation, Phase 1).
 *
 *  Subscribe/Unsubscribe: an EXPLICIT operator action through THE single
 *  consent writer (lib/comms/consent-writer.ts) — the person-keyed canonical
 *  row, every member-keyed mirror row, and the Member marketing booleans move
 *  together in one transaction. Unsubscribe is marketing-only (locked decision
 *  2): lifecycle/transactional mail continues, and NO SuppressionEntry is
 *  minted here.
 *
 *  Block: the distinct, harder action — mints a MANUAL_BLOCK SuppressionEntry
 *  for the channel identifier via the one sanctioned suppression path.
 *  Everything stops, including lifecycle sends (the existing suppression
 *  gates in canSend + gateLifecycleEmail read it). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const channel = body?.channel;
  const status = body?.status;
  const action = body?.action;

  const isBlock = action === 'BLOCK';
  if (
    typeof channel !== 'string' ||
    !CHANNELS.includes(channel as CommChannel) ||
    (!isBlock &&
      (typeof status !== 'string' || !STATUSES.includes(status as SubscriptionStatus)))
  ) {
    return NextResponse.json(
      { error: 'channel must be EMAIL|SMS with status SUBSCRIBED|UNSUBSCRIBED, or action BLOCK' },
      { status: 400 },
    );
  }

  const person = await db.person.findFirst({ where: { id, workspaceId } });
  if (!person) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
  if (person.mergedIntoId) {
    return NextResponse.json(
      { error: 'This record was merged — edit the surviving record instead.' },
      { status: 409 },
    );
  }

  if (isBlock) {
    const identifier = channelIdentifier(person, channel as CommChannel);
    if (!identifier) {
      return NextResponse.json(
        { error: `No ${channel === 'EMAIL' ? 'email address' : 'phone number'} on this record to block.` },
        { status: 400 },
      );
    }
    // Link the block to a Member when one exists, so the suppression_added
    // engagement signal lands on the timeline.
    const linkedMember = await db.member.findFirst({
      where: { workspaceId, personId: person.id },
      select: { id: true },
    });
    await createSuppressionEntry({
      workspaceId,
      channel: channel as CommChannel,
      identifier,
      reason: 'MANUAL_BLOCK',
      source: 'operator_manual',
      memberId: linkedMember?.id ?? null,
      personId: person.id,
    });
    await emitEvent({
      workspaceId,
      actorId: userId,
      action: 'person.channel_blocked',
      entityType: 'PERSON',
      entityId: person.id,
      metadata: { channel, reason: 'MANUAL_BLOCK' },
    });
    return NextResponse.json({ id: person.id, blocked: true });
  }

  await writeConsent({
    workspaceId,
    personId: person.id,
    signal: {
      channel: channel as CommChannel,
      status: status as 'SUBSCRIBED' | 'UNSUBSCRIBED',
      basis: 'OPERATOR_ADDED',
      source: 'operator_manual',
      at: new Date(),
    },
    mode: 'explicit',
    context: 'operator_manual',
  });

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'person.consent_updated',
    entityType: 'PERSON',
    entityId: person.id,
    metadata: { channel, status: status as string },
  });

  return NextResponse.json({ id: person.id, updated: true });
}
