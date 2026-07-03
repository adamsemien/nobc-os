import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { createRateLimiter } from '@/lib/rate-limit';
import {
  listRefundableRsvps,
  refundRsvp,
  remainingRefundableCents,
} from '@/lib/commerce/refund';

/** Mass refund - ADMIN only (Event Builder Rebuild, Phase C - Decision 4a).
 *
 *  POST { dryRun: true }  -> the count + total of the event's refundable
 *  rows, nothing touched. POST { dryRun: false } -> every refundable row
 *  runs the SAME per-refund state machine as the single route: failures
 *  isolate into a per-row result list, retries dedupe at Stripe via the
 *  cumulative idempotency keys, and every full refund revokes its PAY proof.
 *  Full refunds only - partial mass refunds are not a thing.
 */

const massLimiter = createRateLimiter({ limit: 4, windowMs: 60_000 });

const BodySchema = z.object({ dryRun: z.boolean() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id: eventId } = await params;

  if (!massLimiter.allow(`${workspaceId}:${eventId}`)) {
    return NextResponse.json(
      { error: 'Too many mass-refund requests. Give it a moment.' },
      { status: 429 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'dryRun (boolean) required' }, { status: 400 });
  }

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId },
    select: { id: true, title: true },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const refundable = await listRefundableRsvps(db, { workspaceId, eventId });
  const totalRemainingCents = refundable.reduce(
    (sum, r) => sum + remainingRefundableCents(r),
    0,
  );

  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      refundableCount: refundable.length,
      totalRemainingCents,
    });
  }

  // Execute: one row at a time through the shared machine. A failure on row
  // N never blocks row N+1; a retry of the whole call dedupes at Stripe via
  // the cumulative keys and skips already-refunded rows via the 409 guard.
  const results: {
    rsvpId: string;
    ok: boolean;
    refundedCents?: number;
    error?: string;
  }[] = [];
  for (const rsvp of refundable) {
    const outcome = await refundRsvp({
      workspaceId,
      actorId: userId,
      rsvpId: rsvp.id,
    });
    results.push(
      outcome.ok
        ? { rsvpId: rsvp.id, ok: true, refundedCents: outcome.thisRefundCents }
        : { rsvpId: rsvp.id, ok: false, error: outcome.error },
    );
  }

  const succeeded = results.filter((r) => r.ok).length;
  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'event.mass_refund',
      entityType: 'Event',
      entityId: eventId,
      metadata: {
        attempted: results.length,
        succeeded,
        failed: results.length - succeeded,
      },
    },
  });

  return NextResponse.json({
    dryRun: false,
    attempted: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  });
}
