import { NextRequest, NextResponse, after } from 'next/server';
import type Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { resend } from '@/lib/resend';
import { rsvpConfirmedEmail } from '@/lib/email-templates';
import { emitEvent } from '@/lib/emit-event';
import { resolveTicketRecipient, shouldSendConfirmationEmail } from '@/lib/ticket-confirmation';
import { alert } from '@/lib/alerting';

// Transaction client type for the money-state writes performed inside db.$transaction.
type Tx = Prisma.TransactionClient;

/**
 * Build the deferred confirmation-email closure for a ticketed purchase.
 *
 * Runs AFTER the response (via after()) and AFTER the money-state transaction
 * has committed, so every read uses `db` (not `tx`). Preserves the exact
 * recipient/email behavior the pre-hardening handler had: re-fetch the
 * event + member, resolve recipient via resolveTicketRecipient, and send via
 * Resend. The QR is delivered as a hosted <img> (/api/qr/{rsvpId}) — Gmail and
 * Outlook reject inline data: URIs — so we only pass whether a QR exists.
 */
function deferConfirmationEmail(
  deferred: Array<() => Promise<void>>,
  args: {
    eventId: string;
    memberId: string | null | undefined;
    rsvpId: string;
    guestEmail: string | null;
    guestName: string | null;
  },
): void {
  if (!process.env.RESEND_API_KEY) return;
  deferred.push(async () => {
    const eventRecord = await db.event.findUnique({
      where: { id: args.eventId },
      select: { title: true, slug: true, startAt: true, location: true },
    });
    const member = args.memberId
      ? await db.member.findFirst({
          where: { id: args.memberId },
          select: { email: true, firstName: true, lastName: true, memberQrCode: true },
        })
      : null;
    if (!eventRecord || !member) return;

    const { email: toEmail, name } = resolveTicketRecipient(member, {
      guestEmail: args.guestEmail,
      guestName: args.guestName,
    });
    const { subject, html } = rsvpConfirmedEmail(
      name,
      eventRecord.title,
      eventRecord.startAt,
      eventRecord.location,
      eventRecord.slug,
      args.rsvpId,
      Boolean(member.memberQrCode),
    );
    await resend.emails.send({
      from: 'NoBC <team@thenobadcompany.com>',
      to: toEmail,
      subject,
      html,
    });
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency dedup. Stripe delivers at-least-once; if we have already
  // recorded this event id, short-circuit before touching any money state.
  const seen = await db.stripeEvent.findUnique({
    where: { stripeId: event.id },
    select: { id: true },
  });
  if (seen) {
    return NextResponse.json({ received: true, deduped: true });
  }

  // Side effects (audit, Svix, email, alerts) are collected here and run AFTER
  // the response via after(). NOTHING in this array runs inside the transaction.
  const deferred: Array<() => Promise<void>> = [];

  // Resolved inside each case from metadata / the RSVP; recorded on the dedup row.
  let resolvedWorkspaceId: string | null = null;

  try {
    await db.$transaction(async (tx: Tx) => {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const { rsvpId, workspaceId, memberId } = (session.metadata ?? {}) as {
            rsvpId?: string;
            workspaceId?: string;
            memberId?: string;
          };
          // Always record the dedup row at the end of the tx. Only skip the
          // money-state write when there is nothing to write or it is already done.
          if (!rsvpId || !workspaceId) break;
          resolvedWorkspaceId = workspaceId;

          const rsvp = await tx.rSVP.findUnique({
            where: { id: rsvpId },
            select: { id: true, eventId: true, ticketStatus: true, guestEmail: true, guestName: true },
          });
          // Missing RSVP, or already confirmed (Stripe retry): skip the write but
          // still let the dedup row record below.
          if (!rsvp || rsvp.ticketStatus === 'confirmed') break;

          // Money-state write (workspace-scoped defense in depth).
          await tx.rSVP.update({
            where: { id: rsvpId, workspaceId },
            data: { ticketStatus: 'confirmed', status: 'CONFIRMED' },
          });

          // Deferred: audit, Svix rsvp.confirmed, confirmation email.
          deferred.push(async () => {
            await db.auditEvent.create({
              data: {
                workspaceId,
                actorId: memberId ?? 'stripe',
                action: 'rsvp.payment_completed',
                entityType: 'RSVP',
                entityId: rsvpId,
              },
            });
          });
          deferred.push(async () => {
            await emitEvent({
              workspaceId,
              actorId: memberId ?? 'stripe',
              action: 'rsvp.confirmed',
              entityType: 'RSVP',
              entityId: rsvpId,
              metadata: { paymentPath: 'checkout' },
            });
          });
          deferConfirmationEmail(deferred, {
            eventId: rsvp.eventId,
            memberId,
            rsvpId,
            guestEmail: rsvp.guestEmail,
            guestName: rsvp.guestName,
          });
          break;
        }

        case 'payment_intent.amount_capturable_updated': {
          // Card authorized - funds reserved, mark RSVP confirmed + AUTHORIZED.
          const pi = event.data.object as Stripe.PaymentIntent;
          const { workspaceId, memberId } = (pi.metadata ?? {}) as {
            workspaceId?: string;
            memberId?: string;
          };
          resolvedWorkspaceId = workspaceId ?? null;

          const rsvp = await tx.rSVP.findFirst({
            where: { stripePaymentIntentId: pi.id },
            select: { id: true, eventId: true, paymentStatus: true, guestEmail: true, guestName: true },
          });

          // Decide email eligibility from the prior paymentStatus BEFORE the write.
          const isFirstAuthorization = shouldSendConfirmationEmail(rsvp?.paymentStatus ?? null);

          // Money-state write.
          await tx.rSVP.updateMany({
            where: {
              stripePaymentIntentId: pi.id,
              ...(workspaceId ? { workspaceId } : {}),
              paymentStatus: { notIn: ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'] },
            },
            data: { ticketStatus: 'confirmed', status: 'CONFIRMED', paymentStatus: 'AUTHORIZED' },
          });

          if (rsvp && workspaceId) {
            deferred.push(async () => {
              await db.auditEvent.create({
                data: {
                  workspaceId,
                  actorId: memberId ?? 'stripe',
                  action: 'rsvp.payment_authorized',
                  entityType: 'RSVP',
                  entityId: rsvp.id,
                },
              });
            });
            deferred.push(async () => {
              await emitEvent({
                workspaceId,
                actorId: memberId ?? 'stripe',
                action: 'rsvp.confirmed',
                entityType: 'RSVP',
                entityId: rsvp.id,
                metadata: { paymentPath: 'authorize' },
              });
            });
            // Confirmation email only on the first authorization, never on retries.
            if (isFirstAuthorization) {
              deferConfirmationEmail(deferred, {
                eventId: rsvp.eventId,
                memberId,
                rsvpId: rsvp.id,
                guestEmail: rsvp.guestEmail,
                guestName: rsvp.guestName,
              });
            }
          }
          break;
        }

        case 'payment_intent.succeeded': {
          // Captured - update paymentStatus and capturedAt.
          const pi = event.data.object as Stripe.PaymentIntent;
          const { workspaceId, memberId } = (pi.metadata ?? {}) as {
            workspaceId?: string;
            memberId?: string;
          };
          resolvedWorkspaceId = workspaceId ?? null;

          const rsvp = await tx.rSVP.findFirst({
            where: { stripePaymentIntentId: pi.id },
            select: { id: true, eventId: true, paymentStatus: true, guestEmail: true, guestName: true },
          });

          // Decide email eligibility from the prior paymentStatus BEFORE the write.
          // For immediate-capture ticketed purchases, amount_capturable_updated never
          // fires, so succeeded is the only confirm signal and must send the email here.
          // For apply-required (manual capture), paymentStatus was already AUTHORIZED at
          // authorize time, so this returns false and we do NOT double-email.
          const isFirstConfirmation = shouldSendConfirmationEmail(rsvp?.paymentStatus ?? null);

          // Money-state write.
          await tx.rSVP.updateMany({
            where: {
              stripePaymentIntentId: pi.id,
              ...(workspaceId ? { workspaceId } : {}),
              paymentStatus: { notIn: ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'] },
            },
            data: { ticketStatus: 'confirmed', status: 'CONFIRMED', paymentStatus: 'CAPTURED', capturedAt: new Date() },
          });

          if (rsvp && workspaceId) {
            deferred.push(async () => {
              await db.auditEvent.create({
                data: {
                  workspaceId,
                  actorId: memberId ?? 'stripe',
                  action: 'rsvp.payment_captured',
                  entityType: 'RSVP',
                  entityId: rsvp.id,
                },
              });
            });
            // Confirmation email on the immediate-capture path only. False for
            // apply-required (already emailed at authorize time) and on retries.
            if (isFirstConfirmation) {
              deferConfirmationEmail(deferred, {
                eventId: rsvp.eventId,
                memberId,
                rsvpId: rsvp.id,
                guestEmail: rsvp.guestEmail,
                guestName: rsvp.guestName,
              });
            }
          }
          break;
        }

        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled': {
          const pi = event.data.object as Stripe.PaymentIntent;
          const { workspaceId: piWorkspaceId, memberId: piMemberId } = (pi.metadata ?? {}) as {
            workspaceId?: string;
            memberId?: string;
          };
          resolvedWorkspaceId = piWorkspaceId ?? null;

          const failedRsvp = await tx.rSVP.findFirst({
            where: { stripePaymentIntentId: pi.id },
            select: { id: true },
          });

          // Money-state write - only flips RSVPs still in the 'held' state.
          await tx.rSVP.updateMany({
            where: {
              stripePaymentIntentId: pi.id,
              ...(piWorkspaceId ? { workspaceId: piWorkspaceId } : {}),
              ticketStatus: { in: ['held'] },
            },
            data: { ticketStatus: 'payment_failed', status: 'DECLINED', paymentStatus: 'FAILED' },
          });

          if (failedRsvp && piWorkspaceId) {
            const reason = event.type;
            deferred.push(async () => {
              await emitEvent({
                workspaceId: piWorkspaceId,
                actorId: piMemberId ?? 'stripe',
                action: 'rsvp.cancelled',
                entityType: 'RSVP',
                entityId: failedRsvp.id,
                metadata: { reason },
              });
            });
            // A failed/canceled payment must not be silent — surface it to the
            // operator. Mirrors the dispute alert above (PII auto-redacted).
            deferred.push(async () => {
              await alert({
                severity: 'error',
                event: 'stripe.payment_intent.failed',
                workspaceId: piWorkspaceId,
                context: { rsvpId: failedRsvp.id, paymentIntentId: pi.id, reason, amount: pi.amount },
              });
            });
          }
          break;
        }

        case 'charge.refunded': {
          const charge = event.data.object as Stripe.Charge;
          const piId =
            typeof charge.payment_intent === 'string'
              ? charge.payment_intent
              : charge.payment_intent?.id;
          // No payment intent to correlate - just record the dedup row and stop.
          if (!piId) break;

          const rsvp = await tx.rSVP.findFirst({
            where: { stripePaymentIntentId: piId },
            select: { id: true, workspaceId: true },
          });

          const fully = charge.amount_refunded >= charge.amount;
          const refundAmountCents = charge.amount_refunded;

          // Money-state write. Workspace-scoped + do-not-regress guards. The
          // partial branch reserves refundedAt for full refunds so the operator
          // refund route's refundedAt guard is not tripped by a partial.
          if (fully) {
            await tx.rSVP.updateMany({
              where: {
                stripePaymentIntentId: piId,
                ...(rsvp ? { workspaceId: rsvp.workspaceId } : {}),
                // DISPUTED is terminal here too (matches the succeeded/authorize
                // guards) — a refund event must not silently clear a dispute flag.
                paymentStatus: { notIn: ['REFUNDED', 'DISPUTED'] },
              },
              data: {
                paymentStatus: 'REFUNDED',
                ticketStatus: 'refunded',
                refundedAt: new Date(),
                refundAmountCents,
              },
            });
          } else if (rsvp) {
            // Reconciliation authority: update whenever Stripe's cumulative
            // amount_refunded exceeds what we have recorded. amount_refunded is
            // a monotonic running total (never decreases), so a duplicate event
            // is a no-op and a SECOND partial is NOT frozen out — a notIn
            // ['PARTIALLY_REFUNDED'] guard would silently ignore later partials,
            // leaving the DB undercounting and risking an over-refund via the
            // operator route. Prisma cannot compare two columns in `where`, so
            // this is raw SQL. Never regress a row that is already fully REFUNDED.
            await tx.$executeRaw`
              UPDATE "RSVP"
              SET "paymentStatus" = 'PARTIALLY_REFUNDED',
                  "refundAmountCents" = ${refundAmountCents}
              WHERE "stripePaymentIntentId" = ${piId}
                AND "workspaceId" = ${rsvp.workspaceId}
                AND "paymentStatus" NOT IN ('REFUNDED', 'DISPUTED')
                AND ("refundAmountCents" IS NULL OR "refundAmountCents" < ${refundAmountCents})
            `;
          }

          if (rsvp) {
            resolvedWorkspaceId = rsvp.workspaceId;
            const rsvpId = rsvp.id;
            const workspaceId = rsvp.workspaceId;
            deferred.push(async () => {
              await db.auditEvent.create({
                data: {
                  workspaceId,
                  actorId: 'stripe',
                  action: 'rsvp.refunded',
                  entityType: 'RSVP',
                  entityId: rsvpId,
                  metadata: { refundAmountCents, fully },
                },
              });
            });
            // Svix rsvp.cancelled only on a full refund.
            if (fully) {
              deferred.push(async () => {
                await emitEvent({
                  workspaceId,
                  actorId: 'stripe',
                  action: 'rsvp.cancelled',
                  entityType: 'RSVP',
                  entityId: rsvpId,
                  metadata: { reason: 'charge.refunded' },
                });
              });
            }
          }
          break;
        }

        case 'charge.dispute.created': {
          const dispute = event.data.object as Stripe.Dispute;
          const piId =
            typeof dispute.payment_intent === 'string'
              ? dispute.payment_intent
              : dispute.payment_intent?.id;
          // No payment intent to correlate - just record the dedup row and stop.
          if (!piId) break;

          const rsvp = await tx.rSVP.findFirst({
            where: { stripePaymentIntentId: piId },
            select: { id: true, workspaceId: true },
          });

          // Money-state write.
          await tx.rSVP.updateMany({
            where: {
              stripePaymentIntentId: piId,
              ...(rsvp ? { workspaceId: rsvp.workspaceId } : {}),
            },
            data: { paymentStatus: 'DISPUTED' },
          });

          if (rsvp) {
            resolvedWorkspaceId = rsvp.workspaceId;
            const rsvpId = rsvp.id;
            const workspaceId = rsvp.workspaceId;
            const disputeId = dispute.id;
            const amount = dispute.amount;
            const reason = dispute.reason;
            deferred.push(async () => {
              await alert({
                severity: 'critical',
                event: 'stripe.dispute.created',
                workspaceId,
                context: { rsvpId, disputeId, amount, reason },
              });
            });
            deferred.push(async () => {
              await db.auditEvent.create({
                data: {
                  workspaceId,
                  actorId: 'stripe',
                  action: 'rsvp.disputed',
                  entityType: 'RSVP',
                  entityId: rsvpId,
                },
              });
            });
          }
          break;
        }
      }

      // Record the dedup row in the SAME transaction as the money-state writes.
      // If anything above threw, this never commits and Stripe retries.
      await tx.stripeEvent.create({
        data: {
          stripeId: event.id,
          type: event.type,
          workspaceId: resolvedWorkspaceId,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // A concurrent duplicate delivery already processed this event (unique
      // constraint on stripeId). Treat as success - it is already handled.
      return NextResponse.json({ received: true, deduped: true });
    }
    console.error('[stripe-webhook] processing failed; returning 500 for Stripe retry', {
      type: event.type,
      stripeId: event.id,
      err,
    });
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }

  // Side effects run AFTER the response. The transaction is committed by now,
  // so every closure reads/writes via `db`. A failed side effect is logged but
  // never re-triggers a Stripe retry (the money state is already durable).
  if (deferred.length > 0) {
    after(async () => {
      for (const fn of deferred) {
        try {
          await fn();
        } catch (e) {
          console.error('[stripe-webhook] deferred side effect failed:', e);
        }
      }
    });
  }

  return NextResponse.json({ received: true });
}
