/** Blast send (Stage 18, 4D) - one-off operator message to one event's
 *  confirmed attendees. ADMIN only; requireRole is the security boundary.
 *
 *  Safety rails, all server-enforced:
 *   - the dry run is mandatory: `expectedRecipients` must equal the live
 *     resolution's queued count or the send refuses (the operator confirmed
 *     a list that no longer exists);
 *   - `confirm: true` is a literal flag - the same humans-approve pattern as
 *     publish. No agent surface reaches this route; any future one proposes
 *     drafts and never sets confirm;
 *   - durable rate limit: 4 blasts per event per rolling hour, counted from
 *     Blast rows (survives deploys and instances);
 *   - double-submit fires once: clientToken idempotency + the DRAFT->SENDING
 *     claim in the engine;
 *   - SMS refuses over 200 recipients with honest copy (in-request pacing at
 *     1 msg/sec bounds the run; never a silent cap) and 503s when the
 *     marketing number is unset.
 *
 *  GET returns the surface config ({ smsEnabled }) so the panel renders the
 *  disabled state honestly.
 */
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { marketingSmsConfigured } from '@/lib/twilio';
import { resolveBlastRecipients } from '@/lib/blast/recipients';
import { BlastAlreadyFiredError, createBlast, fireBlast } from '@/lib/blast/run';
import { shadowProbeRecipients } from '@/lib/comms/can-send';

const BLASTS_PER_EVENT_PER_HOUR = 4;
const SMS_RECIPIENT_CAP = 200;

const bodySchema = z.object({
  channel: z.enum(['EMAIL', 'SMS']),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(2000),
  confirm: z.literal(true),
  expectedRecipients: z.number().int().min(1),
  clientToken: z.string().min(8).max(64),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const event = await db.event.findFirst({
    where: { id, workspaceId: gate.workspaceId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  return NextResponse.json({ smsEnabled: marketingSmsConfigured() });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 });
  }
  if (body.channel === 'EMAIL' && !body.subject) {
    return NextResponse.json({ error: 'Email needs a subject.' }, { status: 400 });
  }

  const event = await db.event.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (body.channel === 'SMS' && !marketingSmsConfigured()) {
    return NextResponse.json(
      {
        error:
          'Text blasts are not set up yet - the marketing number is not configured.',
      },
      { status: 503 },
    );
  }

  // Durable rate limit: the Blast table is the counter.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentBlasts = await db.blast.count({
    where: { workspaceId, eventId: event.id, createdAt: { gte: hourAgo } },
  });
  if (recentBlasts >= BLASTS_PER_EVENT_PER_HOUR) {
    return NextResponse.json(
      {
        error: `This event already had ${BLASTS_PER_EVENT_PER_HOUR} blasts in the last hour - try again later.`,
      },
      { status: 429 },
    );
  }

  const resolution = await resolveBlastRecipients(db, {
    workspaceId,
    eventId: event.id,
    channel: body.channel,
  });
  if (resolution.counts.queued === 0) {
    return NextResponse.json(
      { error: 'No attendee can receive this message - check the guest list.' },
      { status: 409 },
    );
  }
  // The dry run is mandatory: a stale confirmation never fires.
  if (resolution.counts.queued !== body.expectedRecipients) {
    return NextResponse.json(
      { error: 'The guest list changed - run the check again.' },
      { status: 409 },
    );
  }
  if (body.channel === 'SMS' && resolution.counts.queued > SMS_RECIPIENT_CAP) {
    return NextResponse.json(
      {
        error: `Text blasts cap at ${SMS_RECIPIENT_CAP} recipients (this list has ${resolution.counts.queued}). Split the send or use email.`,
      },
      { status: 422 },
    );
  }

  // Consent floor (Phase 1) — SHADOW ONLY. Compute what canSend WOULD decide for
  // each queued recipient and log a summary; this does NOT change who is sent to.
  // The blast's own verdicts (Member marketing booleans + SuppressedContact) stay
  // authoritative until enforcement flips (COMMS_CONSENT_ENFORCEMENT=enforce) AFTER
  // the Phase-2 backfill. Guarded — a probe failure never blocks the send.
  try {
    await shadowProbeRecipients({
      workspaceId,
      channel: body.channel,
      site: 'blast.send',
      recipients: resolution.verdicts
        .filter((v) => v.status === 'QUEUED' && v.destination)
        .map((v) => ({
          id: v.memberId ?? '',
          email: body.channel === 'EMAIL' ? v.destination : null,
          phone: body.channel === 'SMS' ? v.destination : null,
        })),
    });
  } catch (err) {
    console.error('[blast] consent shadow probe failed (non-blocking):', err);
  }

  const { blast, created } = await createBlast(db, {
    workspaceId,
    eventId: event.id,
    channel: body.channel,
    subject: body.channel === 'EMAIL' ? (body.subject ?? null) : null,
    body: body.body,
    createdByUserId: userId,
    clientToken: body.clientToken,
    verdicts: resolution.verdicts,
  });

  try {
    const outcome = await fireBlast(db, blast.id);
    await db.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'blast.sent',
        entityType: 'Blast',
        entityId: blast.id,
        metadata: {
          eventId: event.id,
          channel: body.channel,
          sent: outcome.sent,
          failed: outcome.failed,
          skipped: outcome.skipped,
        },
      },
    }).catch(() => {});
    return NextResponse.json({ ok: true, blastId: blast.id, ...outcome });
  } catch (err) {
    if (err instanceof BlastAlreadyFiredError) {
      // The double-submit twin fired (or is firing) this exact draft.
      const current = await db.blast.findUnique({
        where: { id: blast.id },
        select: { status: true, sentCount: true, failedCount: true, skippedCount: true },
      });
      return NextResponse.json({
        ok: true,
        blastId: blast.id,
        alreadyFired: true,
        status: current?.status ?? 'SENDING',
        sent: current?.sentCount ?? 0,
        failed: current?.failedCount ?? 0,
        skipped: current?.skippedCount ?? 0,
        deduped: !created,
      });
    }
    console.error('[blast] fire failed', {
      blastId: blast.id,
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'The blast could not be sent - check the event log.' },
      { status: 502 },
    );
  }
}
