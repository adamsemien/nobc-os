/** Blast dry run (Stage 18, 4D) - the mandatory first step.
 *
 *  ADMIN only. Returns the exact recipient list with per-person consent
 *  verdicts and skip reasons - the operator sees reach honestly before any
 *  send exists. No rows are written. The send route re-runs this same
 *  resolution and refuses if the counts moved.
 */
import { NextRequest, NextResponse } from 'next/server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/operator-role';
import { marketingSmsConfigured } from '@/lib/twilio';
import { consentBasisCopy } from '@/lib/blast/consent';
import { confirmSentence, resolveBlastRecipients } from '@/lib/blast/recipients';

const bodySchema = z.object({
  channel: z.enum(['EMAIL', 'SMS']),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission('blast.send');
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await params;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'That request could not be read.' }, { status: 400 });
  }

  const event = await db.event.findFirst({
    where: { id, workspaceId },
    select: { id: true, title: true },
  });
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (body.channel === 'SMS' && !marketingSmsConfigured()) {
    return NextResponse.json({
      enabled: false,
      reason:
        'Text blasts are not set up yet - the marketing number (MARKETING_TWILIO_PHONE_NUMBER) is not configured.',
    });
  }

  const resolution = await resolveBlastRecipients(db, {
    workspaceId,
    eventId: event.id,
    channel: body.channel,
  });

  return NextResponse.json({
    enabled: true,
    verdicts: resolution.verdicts,
    counts: resolution.counts,
    confirmSentence: confirmSentence(resolution.counts),
    consentBasis: consentBasisCopy(body.channel),
  });
}
