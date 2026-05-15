import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { z } from 'zod';
import { EventAccessSchema } from '@/lib/event-access-schema';
import { deriveLegacyFromAccess } from '@/lib/event-access-derive';

const CustomQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'checkbox', 'number', 'date', 'email', 'phone']),
  label: z.string().min(1),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  showToMember: z.boolean().optional(),
  showToGuest: z.boolean().optional(),
  whenInFlow: z.enum(['BEFORE_SUBMIT', 'AFTER_PAYMENT', 'BEFORE_APPROVAL']).optional(),
});

const UpdateSchema = z.object({
  customQuestions: z.array(CustomQuestionSchema).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional().nullable(),
  location: z.string().optional().nullable(),
  heroImageAssetId: z.string().optional().nullable(),
  capacity: z.number().int().positive().nullable().optional(),
  accessMode: z.enum(['OPEN', 'TICKETED', 'APPLY_OR_PAY']).optional(),
  applyMode: z.enum(['APPROVAL_HOLDS_TICKET', 'SUBMIT_CONFIRMS_ENTRY']).optional().nullable(),
  priceInCents: z.number().int().nonnegative().nullable().optional(),
  nonMemberPriceInCents: z.number().int().nonnegative().nullable().optional(),
  approvalRequired: z.boolean().optional(),
  plusOnesAllowed: z.boolean().optional(),
  showCapacity: z.boolean().optional(),
  runOfShow: z.string().optional().nullable(),
  template: z.enum(['editorial', 'split', 'minimal']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']).optional(),
  eventAccess: EventAccessSchema.optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const [event, rsvpStats] = await Promise.all([
    db.event.findFirst({
      where: { id, workspaceId },
      include: {
        customQuestions: { orderBy: { order: 'asc' } },
        _count: { select: { rsvps: true } },
      },
    }),
    db.rSVP.groupBy({
      by: ['ticketStatus'],
      where: { workspaceId, eventId: id },
      _count: { _all: true },
    }),
  ]);

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const confirmedCount = rsvpStats.find(r => r.ticketStatus === 'confirmed')?._count._all ?? 0;
  const heldCount = rsvpStats.find(r => r.ticketStatus === 'held')?._count._all ?? 0;
  const revenueCents =
    event.priceInCents != null && event.priceInCents > 0
      ? confirmedCount * event.priceInCents
      : 0;

  return NextResponse.json({
    event: {
      ...event,
      _stats: { confirmedCount, heldCount, capacityUsed: confirmedCount + heldCount, revenueCents },
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const event = await db.event.findFirst({ where: { id, workspaceId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { customQuestions, startAt, endAt, eventAccess: eventAccessInput, ...rest } = parsed.data;

  // Coerce datetime strings to Date objects
  const eventData: Record<string, unknown> = { ...rest };
  if (startAt) eventData.startAt = new Date(startAt);
  if (endAt !== undefined) eventData.endAt = endAt ? new Date(endAt) : null;

  if (eventAccessInput) {
    const derived = deriveLegacyFromAccess(eventAccessInput);
    eventData.eventAccess = eventAccessInput as object;
    eventData.accessMode = derived.accessMode;
    eventData.applyMode = derived.applyMode;
    eventData.approvalRequired = derived.approvalRequired;
    eventData.priceInCents = derived.priceInCents;
    eventData.nonMemberPriceInCents = derived.nonMemberPriceInCents;
  }

  const statusChanged = rest.status !== undefined && rest.status !== event.status;

  await db.$transaction(async tx => {
    if (customQuestions !== undefined) {
      await tx.eventCustomQuestion.deleteMany({ where: { eventId: id } });
      if (customQuestions.length > 0) {
        await tx.eventCustomQuestion.createMany({
          data: customQuestions.map((q, idx) => ({
            eventId: id,
            workspaceId,
            label: q.label,
            fieldType: q.type.toUpperCase() as 'TEXT' | 'TEXTAREA' | 'SELECT' | 'MULTISELECT' | 'CHECKBOX' | 'DATE' | 'EMAIL' | 'PHONE',
            options: q.options ?? [],
            required: q.required,
            order: idx,
            showToMember: q.showToMember ?? true,
            showToGuest: q.showToGuest ?? true,
            whenInFlow: q.whenInFlow ?? 'BEFORE_SUBMIT',
          })),
        });
      }
    }

    if (Object.keys(eventData).length > 0) {
      await tx.event.update({ where: { id }, data: eventData });
    }

    if (statusChanged) {
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: 'event.status_changed',
          entityType: 'EVENT',
          entityId: id,
          metadata: { from: event.status, to: rest.status },
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
