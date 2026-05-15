import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { z } from 'zod';

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
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
});

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const data = parsed.data;

  const slugTaken = await db.event.findUnique({
    where: { workspaceId_slug: { workspaceId, slug: data.slug } },
  });
  if (slugTaken) return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });

  const [event] = await db.$transaction([
    db.event.create({
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
        accessMode: data.accessMode,
        applyMode: data.applyMode ?? null,
        priceInCents: data.priceInCents ?? null,
        nonMemberPriceInCents: data.nonMemberPriceInCents ?? null,
        approvalRequired: data.approvalRequired,
        plusOnesAllowed: data.plusOnesAllowed,
        showCapacity: data.showCapacity,
        runOfShow: data.runOfShow ?? null,
        status: data.status,
      },
    }),
    db.auditEvent.create({
      data: {
        workspaceId,
        actorId: userId,
        action: 'event.created',
        entityType: 'EVENT',
        entityId: data.slug,
      },
    }),
  ]);

  return NextResponse.json({ event }, { status: 201 });
}
