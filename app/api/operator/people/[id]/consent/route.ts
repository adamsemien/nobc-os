import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, type CommChannel, type SubscriptionStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';
import { logEngagementEvent } from '@/lib/engagement';

const CHANNELS: CommChannel[] = ['EMAIL', 'SMS'];
const STATUSES: SubscriptionStatus[] = ['SUBSCRIBED', 'UNSUBSCRIBED'];

/** Person-capable consent write path (CRM spine Slice 0). Explicit operator
 *  action, unlike lib/comms/consent-sync.ts's signal-derived sync — it may set
 *  UNSUBSCRIBED directly, which that no-downgrade writer deliberately never
 *  does ("unsubscribe is a separate, explicit action" per its own header).
 *  Always writes memberId: null, personId-keyed rows; the Member-keyed sync
 *  path is untouched. Prisma can't express the personId-based compound unique
 *  (it's a raw partial index — see CLAUDE.md), so this does a manual
 *  find-then-create/update instead of an upsert. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const channel = (body as Record<string, unknown> | null)?.channel;
  const status = (body as Record<string, unknown> | null)?.status;
  if (
    typeof channel !== 'string' ||
    typeof status !== 'string' ||
    !CHANNELS.includes(channel as CommChannel) ||
    !STATUSES.includes(status as SubscriptionStatus)
  ) {
    return NextResponse.json(
      { error: 'channel must be EMAIL|SMS, status must be SUBSCRIBED|UNSUBSCRIBED' },
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

  const existing = await db.channelSubscription.findFirst({
    where: { workspaceId, personId: person.id, memberId: null, channel: channel as CommChannel, stream: '*' },
    select: { id: true },
  });

  const now = new Date();
  if (existing) {
    await db.channelSubscription.update({
      where: { id: existing.id },
      data: {
        status: status as SubscriptionStatus,
        consentBasis: 'OPERATOR_ADDED',
        consentSource: 'operator_manual',
        consentAt: now,
        syncedAt: now,
      },
    });
  } else {
    await db.channelSubscription.create({
      data: {
        workspaceId,
        personId: person.id,
        memberId: null,
        channel: channel as CommChannel,
        stream: '*',
        status: status as SubscriptionStatus,
        consentBasis: 'OPERATOR_ADDED',
        consentSource: 'operator_manual',
        consentAt: now,
        syncedAt: now,
      },
    });
  }

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'person.consent_updated',
    entityType: 'PERSON',
    entityId: person.id,
    metadata: { channel, status },
  });
  void logEngagementEvent({
    workspaceId,
    personId: person.id,
    eventType: status === 'SUBSCRIBED' ? 'channel_subscribed' : 'channel_unsubscribed',
    metadata: { channel, source: 'operator_manual' },
  });

  return NextResponse.json({ id: person.id, updated: true });
}
