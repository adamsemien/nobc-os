import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { z } from 'zod';
import { EventAccessSchema, defaultEventAccess } from '@/lib/event-access-schema';
import { deriveLegacyFromAccess } from '@/lib/event-access-derive';
import { notifyProducer } from '@/lib/producer-webhook';
import { buildPathsFromTemplate } from '@/lib/workflows/templates';
import type { WorkflowTemplateKey } from '@/lib/workflows/types';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  const events = await db.event.findMany({
    where: { workspaceId },
    select: {
      id: true,
      slug: true,
      title: true,
      startAt: true,
      location: true,
      status: true,
      accessMode: true,
      capacity: true,
      priceInCents: true,
      rsvps: {
        where: { ticketStatus: { in: ['confirmed', 'held'] } },
        select: { ticketStatus: true, stripePaymentIntentId: true, refundAmountCents: true },
      },
    },
    orderBy: { startAt: 'desc' },
  });

  const result = events.map(({ rsvps, ...ev }) => {
    const capacityUsed = rsvps.length;
    const revenueCents = rsvps
      .filter(r => r.ticketStatus === 'confirmed' && r.stripePaymentIntentId != null)
      .reduce((sum, r) => sum + (ev.priceInCents ?? 0) - (r.refundAmountCents ?? 0), 0);
    return { ...ev, capacityUsed, revenueCents };
  });

  return NextResponse.json({ events: result });
}

const CustomQuestionInput = z.object({
  label: z.string().min(1),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'checkbox', 'date', 'email', 'phone']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  showToMember: z.boolean().default(true),
  showToGuest: z.boolean().default(true),
  whenInFlow: z.enum(['BEFORE_SUBMIT', 'AFTER_PAYMENT', 'BEFORE_APPROVAL']).default('BEFORE_SUBMIT'),
});

const CreateSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  description: z.string().optional().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional().nullable(),
  location: z.string().optional().nullable(),
  heroImageAssetId: z.string().optional().nullable(),
  capacity: z.number().int().positive().nullable().optional(),
  accessMode: z.enum(['OPEN', 'TICKETED', 'APPLY_OR_PAY']).default('OPEN'),
  applyMode: z.enum(['APPROVAL_HOLDS_TICKET', 'SUBMIT_CONFIRMS_ENTRY']).optional().nullable(),
  priceInCents: z.number().int().nonnegative().nullable().optional(),
  nonMemberPriceInCents: z.number().int().nonnegative().nullable().optional(),
  approvalRequired: z.boolean().default(false),
  plusOnesAllowed: z.boolean().default(false),
  showCapacity: z.boolean().default(false),
  runOfShow: z.string().optional().nullable(),
  template: z.enum(['editorial', 'split', 'minimal']).default('editorial'),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  customQuestions: z.array(CustomQuestionInput).optional(),
  eventAccess: EventAccessSchema.optional(),
  workflow: z
    .object({
      templateKey: z.enum([
        'open',
        'members_only',
        'apply_or_pay',
        'paid_only',
        'referral_required',
        'invitation_code',
      ]),
      config: z
        .object({
          amountCents: z.number().int().nonnegative().optional(),
          requiresApproval: z.boolean().optional(),
          minReferrals: z.number().int().positive().optional(),
          codes: z.array(z.string()).optional(),
          minTier: z.enum(['top', 'mid', 'low']).optional(),
        })
        .default({}),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { customQuestions, eventAccess: eventAccessInput, workflow, ...data } = parsed.data;

  const slugTaken = await db.event.findUnique({
    where: { workspaceId_slug: { workspaceId, slug: data.slug } },
  });
  if (slugTaken) return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });

  const eventAccess = eventAccessInput ?? defaultEventAccess();
  const derived = deriveLegacyFromAccess(eventAccess);

  const event = await db.$transaction(async tx => {
    const ev = await tx.event.create({
      data: {
        workspaceId,
        title: data.title,
        slug: data.slug,
        description: data.description ?? null,
        startAt: new Date(data.startAt),
        endAt: data.endAt ? new Date(data.endAt) : null,
        location: data.location ?? null,
        heroImageAssetId: data.heroImageAssetId ?? null,
        capacity: data.capacity ?? null,
        accessMode: eventAccessInput ? derived.accessMode : data.accessMode,
        applyMode: eventAccessInput ? derived.applyMode : (data.applyMode ?? null),
        priceInCents: eventAccessInput ? derived.priceInCents : (data.priceInCents ?? null),
        nonMemberPriceInCents: eventAccessInput ? derived.nonMemberPriceInCents : (data.nonMemberPriceInCents ?? null),
        approvalRequired: eventAccessInput ? derived.approvalRequired : data.approvalRequired,
        plusOnesAllowed: data.plusOnesAllowed,
        showCapacity: data.showCapacity,
        runOfShow: data.runOfShow ?? null,
        template: data.template,
        status: data.status,
        eventAccess: eventAccess as object,
      },
    });

    if (customQuestions && customQuestions.length > 0) {
      await tx.eventCustomQuestion.createMany({
        data: customQuestions.map((q, idx) => ({
          eventId: ev.id,
          workspaceId,
          label: q.label,
          fieldType: q.type.toUpperCase() as 'TEXT' | 'TEXTAREA' | 'SELECT' | 'MULTISELECT' | 'CHECKBOX' | 'DATE' | 'EMAIL' | 'PHONE',
          options: q.options ?? [],
          required: q.required,
          order: idx,
          showToMember: q.showToMember,
          showToGuest: q.showToGuest,
          whenInFlow: q.whenInFlow,
        })),
      });
    }

    if (workflow) {
      const paths = buildPathsFromTemplate(
        workflow.templateKey as WorkflowTemplateKey,
        workflow.config,
      );
      await tx.eventWorkflow.create({
        data: {
          workspaceId,
          eventId: ev.id,
          templateKey: workflow.templateKey,
          paths: paths as object,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'event.created',
        entityType: 'EVENT',
        entityId: data.slug,
      },
    });

    return ev;
  });

  // Phase J: an event created already PUBLISHED notifies Producer (fire-and-forget)
  if (event.status === 'PUBLISHED') {
    notifyProducer('event.published', event.id, workspaceId)
      .catch(err => console.error('[events] producer notify failed:', err));
  }

  return NextResponse.json({ event }, { status: 201 });
}
