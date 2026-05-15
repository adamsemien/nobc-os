import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { eventId: string; customAnswers?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const { eventId, customAnswers } = body;
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 });

  const event = await db.event.findFirst({
    where: { id: eventId, workspaceId, status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      slug: true,
      startAt: true,
      location: true,
      capacity: true,
      priceInCents: true,
      nonMemberPriceInCents: true,
    },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const member = await db.member.findFirst({
    where: { workspaceId, clerkUserId: userId },
    select: { id: true, approved: true, email: true, firstName: true, lastName: true },
  });
  if (!member) return NextResponse.json({ error: 'Members only' }, { status: 403 });

  const amountCents = member.approved
    ? (event.priceInCents ?? 0)
    : (event.nonMemberPriceInCents ?? event.priceInCents ?? 0);

  if (amountCents === 0) {
    return NextResponse.json({ error: 'This event does not require payment' }, { status: 400 });
  }

  // Capacity check
  if (event.capacity) {
    const taken = await db.rSVP.count({
      where: { workspaceId, eventId, ticketStatus: { in: ['confirmed', 'held'] } },
    });
    if (taken >= event.capacity) {
      return NextResponse.json({ error: 'Event is at capacity' }, { status: 409 });
    }
  }

  // Duplicate check
  const existing = await db.rSVP.findFirst({
    where: { workspaceId, eventId, memberId: member.id },
    select: { id: true, ticketStatus: true },
  });
  if (existing) {
    if (existing.ticketStatus === 'confirmed') {
      return NextResponse.json({ error: 'Already reserved' }, { status: 409 });
    }
    if (existing.ticketStatus === 'held' || existing.ticketStatus === 'waitlisted') {
      return NextResponse.json({ error: 'Already on waitlist or pending payment' }, { status: 409 });
    }
  }

  // Create pending RSVP
  const rsvp = await db.rSVP.create({
    data: {
      workspaceId,
      eventId,
      memberId: member.id,
      status: 'CONFIRMED',
      ticketStatus: 'held',
      ...(customAnswers !== undefined && { customAnswers: customAnswers as object }),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: event.title },
        unit_amount: amountCents,
      },
      quantity: 1,
    }],
    success_url: `${appUrl}/m/events/${event.slug}?rsvp=success`,
    cancel_url: `${appUrl}/m/events/${event.slug}`,
    customer_email: member.email,
    metadata: { rsvpId: rsvp.id, workspaceId, memberId: member.id, eventId: event.id },
  });

  await db.rSVP.update({
    where: { id: rsvp.id },
    data: { stripePaymentIntentId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
