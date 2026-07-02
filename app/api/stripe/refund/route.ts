import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { refundRsvp } from '@/lib/commerce/refund';

/** Operator single refund - ADMIN. The state machine (full + partial,
 *  cumulative idempotency keys, refund-revokes-proof) lives in
 *  lib/commerce/refund.ts and is shared with the mass-refund route
 *  (Event Builder Rebuild, Phase C - Decision 4). */

const BodySchema = z.object({
  rsvpId: z.string(),
  // Optional partial-refund amount in cents. Omit for a full refund (the whole
  // remaining captured balance).
  amountCents: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'rsvpId required' }, { status: 400 });
  }

  const result = await refundRsvp({
    workspaceId,
    actorId: userId,
    rsvpId: body.rsvpId,
    amountCents: body.amountCents,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    refundAmountCents: result.thisRefundCents,
    cumulativeRefundCents: result.cumulativeRefundCents,
    fully: result.fully,
  });
}
