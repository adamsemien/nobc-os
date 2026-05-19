import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { z } from 'zod';
import { EventAccessSchema } from '@/lib/event-access-schema';
import { deriveLegacyFromAccess } from '@/lib/event-access-derive';
import { emitEvent } from '@/lib/emit-event';
import { notifyProducer } from '@/lib/producer-webhook';
import { sendTemplatedEmail, getPlatformBool } from '@/lib/email';

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

  // Emit Svix outbound events for publish/cancel transitions
  if (statusChanged) {
    if (rest.status === 'PUBLISHED') {
      emitEvent({
        workspaceId,
        actorId: userId,
        action: 'event.published',
        entityType: 'EVENT',
        entityId: id,
        metadata: { previousStatus: event.status },
      }).catch(err => console.error('[events] event.published emit failed:', err));
    } else if (rest.status === 'CANCELLED') {
      emitEvent({
        workspaceId,
        actorId: userId,
        action: 'event.cancelled',
        entityType: 'EVENT',
        entityId: id,
        metadata: { previousStatus: event.status },
      }).catch(err => console.error('[events] event.cancelled emit failed:', err));
    }
  }

  // Phase J: notify Producer of event lifecycle changes (fire-and-forget)
  if (statusChanged && rest.status === 'PUBLISHED') {
    notifyProducer('event.published', id, workspaceId)
      .catch(err => console.error('[events] producer notify failed:', err));
  } else if (statusChanged && rest.status === 'CANCELLED') {
    notifyProducer('event.cancelled', id, workspaceId)
      .catch(err => console.error('[events] producer notify failed:', err));
  } else if (!statusChanged && event.status === 'PUBLISHED') {
    notifyProducer('event.updated', id, workspaceId)
      .catch(err => console.error('[events] producer notify failed:', err));
  }

  // Fan-out templated announcement to approved members on first publish.
  if (statusChanged && rest.status === 'PUBLISHED') {
    const shouldNotify = await getPlatformBool(workspaceId, 'event.notify_on_publish', true);
    if (shouldNotify) {
      void notifyMembersOfPublish(workspaceId, id, userId).catch(err =>
        console.error('[events] member notify failed:', err),
      );
    }
  }

  return NextResponse.json({ ok: true });
}

async function notifyMembersOfPublish(workspaceId: string, eventId: string, actorId: string) {
  const [updated, members] = await Promise.all([
    db.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, slug: true, startAt: true, location: true, description: true },
    }),
    db.member.findMany({
      where: { workspaceId, status: 'APPROVED', email: { not: '' } },
      select: { email: true, firstName: true, lastName: true },
    }),
  ]);
  if (!updated || members.length === 0) return;

  const dateFormatted = updated.startAt.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const eventUrl = `${siteUrl}/m/events/${updated.slug}`;

  let sent = 0;
  let skipped = 0;
  for (const m of members) {
    const result = await sendTemplatedEmail(workspaceId, 'event.published', m.email, {
      member: { firstName: m.firstName, lastName: m.lastName },
      event: {
        title: updated.title,
        dateFormatted,
        location: updated.location ?? '',
        description: updated.description ?? '',
        url: eventUrl,
      },
      site: { url: siteUrl },
    });
    if (result.ok) sent++;
    else skipped++;
  }

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId,
      action: 'event.notification_sent',
      entityType: 'EVENT',
      entityId: eventId,
      metadata: { sent, skipped, recipientCount: members.length },
    },
  }).catch(() => {});
}
