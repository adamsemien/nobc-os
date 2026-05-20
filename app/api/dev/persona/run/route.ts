import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { scoreApplication } from '@/lib/scoring';
import { PERSONA_TEST_TAG, type Persona, type PersonaStep } from '@/lib/dev/persona-types';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type SseEvent = {
  type: 'step.start' | 'step.progress' | 'step.complete' | 'step.error' | 'run.complete' | 'run.error';
  step?: PersonaStep;
  message?: string;
  data?: unknown;
};

function encode(ev: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ev)}\n\n`);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const workspaceId = await requireWorkspaceId(userId);

  let body: { persona?: Persona; steps?: PersonaStep[] } = {};
  try { body = await req.json(); } catch { /* noop */ }
  const persona = body.persona;
  const steps = (body.steps ?? []).filter(Boolean);
  if (!persona || !steps.length) {
    return NextResponse.json({ error: 'persona + steps required' }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: SseEvent) => controller.enqueue(encode(ev));
      const ctx: { applicationId?: string; memberId?: string; rsvpId?: string; eventId?: string } = {};

      try {
        for (const step of steps) {
          send({ type: 'step.start', step });
          try {
            if (step === 'apply') await runApply(workspaceId, persona, ctx, send);
            else if (step === 'auto_approve') await runApprove(workspaceId, ctx, send);
            else if (step === 'rsvp') await runRsvp(workspaceId, ctx, send);
            else if (step === 'pay') await runPay(ctx, send);
            else if (step === 'checkin') await runCheckin(workspaceId, ctx, send);
            send({ type: 'step.complete', step });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Step failed';
            send({ type: 'step.error', step, message: msg });
            break;
          }
        }
        send({ type: 'run.complete', data: ctx });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Run failed';
        send({ type: 'run.error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

async function runApply(
  workspaceId: string,
  persona: Persona,
  ctx: { applicationId?: string },
  send: (ev: SseEvent) => void,
) {
  send({ type: 'step.progress', message: 'Creating application…' });
  const application = await db.application.create({
    data: {
      workspaceId,
      fullName: persona.fullName,
      email: persona.email.toLowerCase(),
      phone: persona.phone ?? null,
      city: persona.city ?? null,
      neighborhood: persona.neighborhood ?? null,
      referredBy: persona.referredBy ?? null,
      consentEmail: true,
      consentSms: false,
      aiTags: [PERSONA_TEST_TAG],
    },
  });

  const answers: Record<string, string> = {
    work_website: persona.workWebsite ?? '',
    what_you_do: persona.whatYouDo ?? '',
    passion_projects: persona.passionProjects ?? '',
    brands_you_love: persona.brandsYouLove ?? '',
    why_nobc: persona.whyNobc ?? '',
    contribution: persona.contribution ?? '',
    home_address: persona.homeAddress ?? '',
    where_from: persona.whereFrom ?? '',
    birthday: persona.birthday ?? '',
    sunday_morning: persona.rapidFire?.sundayMorning ?? '',
    karaoke_order: persona.rapidFire?.karaokeOrder ?? '',
    if_not_here: persona.rapidFire?.ifNotHere ?? '',
  };
  await Promise.all(
    Object.entries(answers).map(([k, v]) =>
      db.applicationAnswer.create({ data: { applicationId: application.id, questionKey: k, answer: v } }),
    ),
  );

  send({ type: 'step.progress', message: 'Running AI scoring…' });
  try {
    const result = await scoreApplication(application.id);
    const refetched = await db.application.findUnique({ where: { id: application.id }, select: { aiScore: true } });
    const score100 = Math.round((refetched?.aiScore ?? 0) * 100);
    send({
      type: 'step.progress',
      message: `Scored: ${score100} / 100 — ${result.archetype} — ${result.aiRecommendation}`,
      data: { archetype: result.archetype, recommendation: result.aiRecommendation, tags: result.tags },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    send({ type: 'step.progress', message: `AI scoring skipped: ${msg}` });
  }

  ctx.applicationId = application.id;
  send({ type: 'step.progress', message: `Application id: ${application.id}` });
}

async function runApprove(
  workspaceId: string,
  ctx: { applicationId?: string; memberId?: string },
  send: (ev: SseEvent) => void,
) {
  if (!ctx.applicationId) throw new Error('No application — run apply first.');
  const app = await db.application.findUnique({ where: { id: ctx.applicationId } });
  if (!app) throw new Error('Application not found.');

  const now = new Date();
  await db.application.update({
    where: { id: app.id },
    data: { status: 'APPROVED', reviewedAt: now },
  });

  const nameParts = app.fullName.trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const member = await db.member.upsert({
    where: { workspaceId_email: { workspaceId, email: app.email } },
    update: { status: 'APPROVED', approved: true, approvedAt: now },
    create: {
      workspaceId,
      clerkUserId: `app_${app.id}`,
      email: app.email,
      firstName,
      lastName,
      phone: app.phone ?? undefined,
      status: 'APPROVED',
      approved: true,
      approvedAt: now,
    },
  });
  await db.application.update({ where: { id: app.id }, data: { memberId: member.id } });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorType: 'SYSTEM',
      action: 'application.approved',
      entityType: 'Application',
      entityId: app.id,
      metadata: { source: 'persona_runner' },
    },
  });

  ctx.memberId = member.id;
  send({ type: 'step.progress', message: `Member created: ${member.id}` });
}

async function runRsvp(
  workspaceId: string,
  ctx: { memberId?: string; rsvpId?: string; eventId?: string },
  send: (ev: SseEvent) => void,
) {
  if (!ctx.memberId) throw new Error('No member — run auto_approve first.');
  const event = await db.event.findFirst({
    where: { workspaceId, status: 'PUBLISHED', startAt: { gt: new Date() } },
    orderBy: { startAt: 'asc' },
    select: { id: true, slug: true, title: true, priceInCents: true },
  });
  if (!event) throw new Error('No upcoming published events.');

  const rsvp = await db.rSVP.create({
    data: {
      workspaceId,
      eventId: event.id,
      memberId: ctx.memberId,
      status: 'CONFIRMED',
      ticketStatus: 'confirmed',
      origin: 'persona_runner',
      customAnswers: { persona_test: true },
    },
  });
  ctx.rsvpId = rsvp.id;
  ctx.eventId = event.id;
  send({ type: 'step.progress', message: `RSVP confirmed for "${event.title}"`, data: { eventId: event.id, rsvpId: rsvp.id } });
}

async function runPay(
  ctx: { rsvpId?: string; eventId?: string },
  send: (ev: SseEvent) => void,
) {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (!key.startsWith('sk_test_')) {
    throw new Error('Switch Stripe to Test Mode before running paid scenarios.');
  }
  if (!ctx.rsvpId) throw new Error('No RSVP — run rsvp first.');

  const Stripe = (await import('stripe')).default;
  // Stripe's apiVersion is a literal-union type that lags behind the live API;
  // pinning to a version newer than the SDK's published union requires a cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(key, { apiVersion: '2025-09-30.clover' as any });

  send({ type: 'step.progress', message: 'Creating test PaymentIntent…' });
  const pi = await stripe.paymentIntents.create({
    amount: 5000,
    currency: 'usd',
    payment_method: 'pm_card_visa',
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { source: 'persona_runner', rsvpId: ctx.rsvpId },
  });

  await db.rSVP.update({
    where: { id: ctx.rsvpId },
    data: { stripePaymentIntentId: pi.id, ticketStatus: 'confirmed' },
  });
  send({ type: 'step.progress', message: `PaymentIntent ${pi.status} — ${pi.id}` });
}

async function runCheckin(
  workspaceId: string,
  ctx: { rsvpId?: string },
  send: (ev: SseEvent) => void,
) {
  if (!ctx.rsvpId) throw new Error('No RSVP — run rsvp first.');
  await db.rSVP.update({
    where: { id: ctx.rsvpId },
    data: { checkedIn: true, checkedInAt: new Date() },
  });
  await db.auditEvent.create({
    data: {
      workspaceId,
      actorType: 'SYSTEM',
      action: 'rsvp.checked_in',
      entityType: 'RSVP',
      entityId: ctx.rsvpId,
      metadata: { source: 'persona_runner' },
    },
  });
  send({ type: 'step.progress', message: 'Checked in.' });
}
