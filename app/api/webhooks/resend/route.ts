/** Resend webhook — Slice 3 "Communicate + log it".
 *
 * Advances a TransactionalEmailLog row's status (sent -> delivered/opened/clicked/
 * bounced/complained) as Resend reports delivery events, and emits the matching
 * MemberEngagementEvent when the row already carries a memberId/personId — this is
 * the piece that "feeds the timeline" per the slice's own framing.
 *
 * Svix-verified, same pattern as app/api/webhooks/clerk/route.ts (Resend's webhook
 * delivery is Svix-based). FAIL-CLOSED: without the signing secret nothing can be
 * verified.
 *
 * NOT fully confident about the exact Resend webhook payload shape below (data.type,
 * data.email_id, data.to) — reasoned from Resend's documented event model, not
 * verified against a live delivery in this environment (no RESEND_API_KEY / no
 * internet access here). Flagged explicitly in the build report; confirm against a
 * real webhook delivery (or Resend's dashboard "send test event") before relying on
 * this in production.
 *
 * Setup (Adam): create a webhook endpoint in the Resend dashboard pointing at
 * /api/webhooks/resend, subscribe to delivered/opened/clicked/bounced/complained,
 * and set its signing secret as RESEND_WEBHOOK_SECRET in Vercel.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import type { MemberEngagementEventType, SuppressionReason } from '@prisma/client';
import { db } from '@/lib/db';
import { logEngagementEvent } from '@/lib/engagement';
import { createSuppressionEntry } from '@/lib/comms/suppression';

type ResendWebhookEvent = {
  type: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    [key: string]: unknown;
  };
};

type StatusMapping = {
  status: string;
  engagementType?: MemberEngagementEventType;
  timestampField?: 'openedAt' | 'clickedAt';
};

const STATUS_BY_TYPE: Record<string, StatusMapping> = {
  'email.delivered': { status: 'delivered', engagementType: 'email_delivered' },
  'email.opened': { status: 'opened', engagementType: 'email_opened', timestampField: 'openedAt' },
  'email.clicked': { status: 'clicked', engagementType: 'email_clicked', timestampField: 'clickedAt' },
  'email.bounced': { status: 'bounced', engagementType: 'email_bounced' },
  // No MemberEngagementEventType for complaints — access/suppression concept, not
  // an engagement signal; TransactionalEmailLog.status still records it.
  'email.complained': { status: 'complained' },
};

/** Consent reconciliation Phase 1: bounces and complaints finally get their
 *  SuppressionEntry writer. Minted through the ONE sanctioned path
 *  (createSuppressionEntry - normalizes the identifier the way canSend and
 *  the lifecycle gate read it), so the hard block applies to every future
 *  send, transactional included. */
const SUPPRESSION_BY_TYPE: Record<string, SuppressionReason> = {
  'email.bounced': 'HARD_BOUNCE',
  'email.complained': 'SPAM_COMPLAINT',
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET unset — rejecting (fail-closed)');
    return new NextResponse('Webhook not configured', { status: 401 });
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse('Missing svix headers', { status: 401 });
  }

  const payload = await req.text();
  let event: ResendWebhookEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookEvent;
  } catch (err) {
    console.error('[resend-webhook] signature verification failed:', err);
    return new NextResponse('Invalid signature', { status: 401 });
  }

  const mapping = STATUS_BY_TYPE[event.type];
  if (!mapping) return NextResponse.json({ received: true });

  const emailId = event.data.email_id;
  if (!emailId) return NextResponse.json({ received: true, skipped: 'no_email_id' });

  // A single sendTemplatedEmail() call can cover multiple recipients under one
  // shared providerId (lib/email.ts, see TransactionalEmailLog's own doc comment) —
  // `to` disambiguates which specific row(s) this event belongs to. Falls back to
  // updating every row for this providerId if Resend's payload has no `to`.
  const toRaw = event.data.to;
  const toList = Array.isArray(toRaw) ? toRaw : toRaw ? [toRaw] : [];

  const rows = await db.transactionalEmailLog.findMany({
    where: {
      providerId: emailId,
      ...(toList.length ? { to: { in: toList } } : {}),
    },
  });

  for (const row of rows) {
    await db.transactionalEmailLog
      .update({
        where: { id: row.id },
        data: {
          status: mapping.status,
          ...(mapping.timestampField === 'openedAt' ? { openedAt: new Date() } : {}),
          ...(mapping.timestampField === 'clickedAt' ? { clickedAt: new Date() } : {}),
        },
      })
      .catch((err) => console.error(`[resend-webhook] status update failed (log=${row.id}):`, err));

    if (mapping.engagementType && (row.memberId || row.personId)) {
      void logEngagementEvent({
        workspaceId: row.workspaceId,
        memberId: row.memberId,
        personId: row.personId,
        eventType: mapping.engagementType,
        metadata: { templateKey: row.templateKey, to: row.to, providerId: emailId },
      });
    }

    // Hard-block the address on bounce/complaint. Fail-soft: a suppression
    // write failure is logged and never fails the webhook (Resend would
    // retry the whole event otherwise).
    const suppressionReason = SUPPRESSION_BY_TYPE[event.type];
    if (suppressionReason) {
      await createSuppressionEntry({
        workspaceId: row.workspaceId,
        channel: 'EMAIL',
        identifier: row.to,
        reason: suppressionReason,
        source: 'resend_webhook',
        memberId: row.memberId,
        personId: row.personId,
      }).catch((err) =>
        console.error(`[resend-webhook] suppression write failed (log=${row.id}):`, err),
      );
    }
  }

  return NextResponse.json({ received: true });
}
