import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { resend } from '@/lib/resend';
import { rsvpConfirmedEmail } from '@/lib/email-templates';
import { emitEvent } from '@/lib/emit-event';
import { resolveTicketRecipient, shouldSendConfirmationEmail } from '@/lib/ticket-confirmation';

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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const { rsvpId, workspaceId, memberId } = session.metadata as {
        rsvpId: string; workspaceId: string; memberId: string;
      };
      if (!rsvpId || !workspaceId) break;

      const rsvp = await db.rSVP.findUnique({
        where: { id: rsvpId },
        select: { id: true, eventId: true, ticketStatus: true, guestEmail: true, guestName: true },
      });
      if (!rsvp) break;

      // Dedup: if already confirmed, Stripe is retrying — skip all writes + email.
      if (rsvp.ticketStatus === 'confirmed') break;

      const eventRecord = await db.event.findUnique({
        where: { id: rsvp.eventId },
        select: { id: true, title: true, slug: true, startAt: true, location: true },
      });

      await db.rSVP.update({
        where: { id: rsvpId },
        data: { ticketStatus: 'confirmed', status: 'CONFIRMED' },
      });

      await db.auditEvent.create({
        data: {
          workspaceId,
          actorId: memberId ?? 'stripe',
          action: 'rsvp.payment_completed',
          entityType: 'RSVP',
          entityId: rsvpId,
        },
      });

      // Svix outbound: rsvp.confirmed
      emitEvent({
        workspaceId,
        actorId: memberId ?? 'stripe',
        action: 'rsvp.confirmed',
        entityType: 'RSVP',
        entityId: rsvpId,
        metadata: { paymentPath: 'checkout' },
      }).catch(err => console.error('[stripe-webhook] rsvp.confirmed emit failed:', err));

      if (process.env.RESEND_API_KEY && eventRecord) {
        const member = await db.member.findFirst({
          where: { id: memberId },
          select: { email: true, firstName: true, lastName: true, memberQrCode: true },
        });
        if (member) {
          const { email: toEmail, name } = resolveTicketRecipient(member, rsvp);
          let qrDataUrl: string | undefined;
          if (member.memberQrCode) {
            const QRCode = (await import('qrcode')).default;
            qrDataUrl = await QRCode.toDataURL(member.memberQrCode, { width: 400, margin: 1 });
          }
          const { subject, html } = rsvpConfirmedEmail(
            name,
            eventRecord.title,
            eventRecord.startAt,
            eventRecord.location,
            eventRecord.slug,
            rsvpId,
            qrDataUrl,
          );
          resend.emails.send({
            from: 'NoBC <team@thenobadcompany.com>',
            to: toEmail,
            subject,
            html,
          }).catch(err => console.error('[stripe-webhook] rsvp email failed:', err));
        }
      }
      break;
    }

    case 'payment_intent.amount_capturable_updated': {
      // Card authorized — funds reserved, mark RSVP confirmed + paymentStatus AUTHORIZED
      const pi = event.data.object as Stripe.PaymentIntent;
      const { workspaceId, memberId } = pi.metadata as { workspaceId: string; memberId: string };
      const rsvp = await db.rSVP.findFirst({
        where: { stripePaymentIntentId: pi.id },
        select: { id: true, eventId: true, paymentStatus: true, guestEmail: true, guestName: true },
      });

      // Dedup: check prior paymentStatus BEFORE writing. If already AUTHORIZED or CAPTURED,
      // Stripe is retrying a delivered webhook — skip writes and do NOT re-send email.
      const isFirstAuthorization = shouldSendConfirmationEmail(rsvp?.paymentStatus ?? null);

      await db.rSVP.updateMany({
        where: { stripePaymentIntentId: pi.id },
        data: { ticketStatus: 'confirmed', status: 'CONFIRMED', paymentStatus: 'AUTHORIZED' },
      });

      if (rsvp && workspaceId) {
        await db.auditEvent.create({
          data: {
            workspaceId,
            actorId: memberId ?? 'stripe',
            action: 'rsvp.payment_authorized',
            entityType: 'RSVP',
            entityId: rsvp.id,
          },
        });

        // Svix outbound: rsvp.confirmed (authorized = payment held, seat confirmed)
        emitEvent({
          workspaceId,
          actorId: memberId ?? 'stripe',
          action: 'rsvp.confirmed',
          entityType: 'RSVP',
          entityId: rsvp.id,
          metadata: { paymentPath: 'authorize' },
        }).catch(err => console.error('[stripe-webhook] rsvp.confirmed emit failed:', err));

        // Send confirmation email — only on the first authorization, never on retries.
        if (process.env.RESEND_API_KEY && isFirstAuthorization) {
          const eventRecord = await db.event.findUnique({
            where: { id: rsvp.eventId },
            select: { title: true, slug: true, startAt: true, location: true },
          });
          const member = memberId
            ? await db.member.findFirst({
                where: { id: memberId },
                select: { email: true, firstName: true, lastName: true, memberQrCode: true },
              })
            : null;
          if (eventRecord && member) {
            const { email: toEmail, name } = resolveTicketRecipient(member, rsvp);
            let qrDataUrl: string | undefined;
            if (member.memberQrCode) {
              const QRCode = (await import('qrcode')).default;
              qrDataUrl = await QRCode.toDataURL(member.memberQrCode, { width: 400, margin: 1 });
            }
            const { subject, html } = rsvpConfirmedEmail(
              name,
              eventRecord.title,
              eventRecord.startAt,
              eventRecord.location,
              eventRecord.slug,
              rsvp.id,
              qrDataUrl,
            );
            resend.emails
              .send({ from: 'NoBC <team@thenobadcompany.com>', to: toEmail, subject, html })
              .catch((err) => console.error('[stripe-webhook] confirmation email failed:', err));
          }
        }
      }
      break;
    }

    case 'payment_intent.succeeded': {
      // Captured — update paymentStatus and capturedAt
      const pi = event.data.object as Stripe.PaymentIntent;
      const { workspaceId, memberId } = pi.metadata as { workspaceId: string; memberId: string };
      const rsvp = await db.rSVP.findFirst({
        where: { stripePaymentIntentId: pi.id },
        select: { id: true },
      });
      await db.rSVP.updateMany({
        where: { stripePaymentIntentId: pi.id },
        data: { ticketStatus: 'confirmed', paymentStatus: 'CAPTURED', capturedAt: new Date() },
      });
      if (rsvp && workspaceId) {
        await db.auditEvent.create({
          data: {
            workspaceId,
            actorId: memberId ?? 'stripe',
            action: 'rsvp.payment_captured',
            entityType: 'RSVP',
            entityId: rsvp.id,
          },
        });
      }
      break;
    }

    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const { workspaceId: piWorkspaceId, memberId: piMemberId } = pi.metadata as {
        workspaceId?: string; memberId?: string;
      };
      const failedRsvp = await db.rSVP.findFirst({
        where: { stripePaymentIntentId: pi.id },
        select: { id: true },
      });
      await db.rSVP.updateMany({
        where: { stripePaymentIntentId: pi.id, ticketStatus: { in: ['held'] } },
        data: { ticketStatus: 'payment_failed', status: 'DECLINED', paymentStatus: 'FAILED' },
      });
      if (failedRsvp && piWorkspaceId) {
        emitEvent({
          workspaceId: piWorkspaceId,
          actorId: piMemberId ?? 'stripe',
          action: 'rsvp.cancelled',
          entityType: 'RSVP',
          entityId: failedRsvp.id,
          metadata: { reason: event.type },
        }).catch(err => console.error('[stripe-webhook] rsvp.cancelled emit failed:', err));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
