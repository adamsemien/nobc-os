import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { emitEvent } from '@/lib/emit-event';

/** Segment UI build — "Add to list" (Person detail page, single person at a
 *  time; bulk/list-first add is out of scope). Writes a SegmentSnapshotMember
 *  row, dual-pointer (personId always; memberId when the Person has one) — a
 *  bare lead can be added to a static list without being promoted to Member.
 *  Only ever targets a STATIC segment: a DYNAMIC segment's membership is
 *  computed by lib/segments/evaluate.ts, not hand-editable. Accepts either an
 *  existing segmentId or a newListName (create-then-add, one call, so the UI
 *  never has to reconcile a create that succeeded and an add that failed). */
const BodySchema = z
  .object({
    segmentId: z.string().min(1).optional(),
    newListName: z.string().min(1).max(200).optional(),
  })
  .refine((b) => Boolean(b.segmentId) !== Boolean(b.newListName), {
    message: 'Provide exactly one of segmentId or newListName.',
  });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide exactly one of segmentId or newListName.' }, { status: 400 });
  }
  const { segmentId, newListName } = parsed.data;

  const person = await db.person.findFirst({
    where: { id, workspaceId },
    include: { members: { where: { mergedIntoId: null }, select: { id: true }, take: 1 } },
  });
  if (!person) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
  if (person.mergedIntoId) {
    return NextResponse.json(
      { error: 'This record was merged — add the surviving record to the list instead.' },
      { status: 409 },
    );
  }

  let segment: { id: string; name: string };
  if (newListName) {
    segment = await db.segment.create({
      data: {
        workspaceId,
        name: newListName,
        kind: 'STATIC',
        definition: {},
        createdBy: userId,
      },
      select: { id: true, name: true },
    });
  } else {
    const existing = await db.segment.findFirst({
      where: { id: segmentId, workspaceId },
      select: { id: true, name: true, kind: true },
    });
    if (!existing) return NextResponse.json({ error: 'List not found.' }, { status: 404 });
    if (existing.kind !== 'STATIC') {
      return NextResponse.json(
        { error: 'Only a static list can be hand-edited — this segment is dynamic (rule-based).' },
        { status: 400 },
      );
    }
    segment = existing;
  }

  const memberId = person.members[0]?.id ?? null;

  try {
    await db.segmentSnapshotMember.create({
      data: { segmentId: segment.id, personId: person.id, memberId },
    });
    // Keep the list page's Count column honest — the detail page always reads
    // the live SegmentSnapshotMember rows directly, but the list page shows
    // cachedCount (set once at creation), same as every other segment write.
    await db.segment.update({ where: { id: segment.id }, data: { cachedCount: { increment: 1 } } });
  } catch (err) {
    // The out-of-band partial unique indexes (see prisma/sql/segments-slice4.sql)
    // reject a duplicate person/member on the same segment — treat that as a
    // no-op success, not an error, since the person IS on the list.
    const isDuplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
    if (!isDuplicate) throw err;
  }

  await emitEvent({
    workspaceId,
    actorId: userId,
    action: 'person.added_to_segment',
    entityType: 'PERSON',
    entityId: person.id,
    metadata: { segmentId: segment.id, segmentName: segment.name },
  });

  return NextResponse.json({ segmentId: segment.id, segmentName: segment.name });
}
