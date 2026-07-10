import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { evaluateSegment, resolveSegmentPopulation, type SegmentFilterDefinition } from '@/lib/segments/evaluate';
import { FilterDefinitionSchema } from '@/lib/segments/filter-schema';

/** DYNAMIC segments re-evaluate live on every read (no caching beyond the
 *  request). STATIC segments read the frozen SegmentSnapshotMember rows from
 *  creation time — the evaluator is never called for them again. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const segment = await db.segment.findFirst({ where: { id, workspaceId } });
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const identities = await resolveSegmentPopulation(db, segment);

  const personIds = identities.map((i) => i.personId).filter((x): x is string => Boolean(x));
  const memberIds = identities.map((i) => i.memberId).filter((x): x is string => Boolean(x));

  const [persons, members] = await Promise.all([
    personIds.length
      ? db.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
    memberIds.length
      ? db.member.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, firstName: true, lastName: true, email: true, status: true },
        })
      : Promise.resolve([]),
  ]);
  const personById = new Map(persons.map((p) => [p.id, p]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const resolved = identities.map((i) => ({
    personId: i.personId,
    memberId: i.memberId,
    person: i.personId ? (personById.get(i.personId) ?? null) : null,
    member: i.memberId ? (memberById.get(i.memberId) ?? null) : null,
  }));

  return NextResponse.json({ segment, resolvedCount: identities.length, members: resolved });
}

const UpdateSegmentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  // Only meaningful for a DYNAMIC segment — a STATIC list is hand-curated via
  // SegmentSnapshotMember, not a filter, so its "definition" is not editable.
  definition: FilterDefinitionSchema.optional(),
});

/** Rename a segment, or (DYNAMIC only) edit its filter — re-evaluates and
 *  refreshes cachedCount when the definition changes. STATIC segments only
 *  ever accept name/description here; their membership is edited via
 *  POST /api/operator/people/[id]/segments (add-to-list), one person at a time. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await params;

  const segment = await db.segment.findFirst({ where: { id, workspaceId } });
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = UpdateSegmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { name, description, definition } = parsed.data;

  if (definition && segment.kind !== 'DYNAMIC') {
    return NextResponse.json(
      { error: 'Only a DYNAMIC segment’s filter can be edited — a STATIC list is hand-curated.' },
      { status: 400 },
    );
  }

  const data: Prisma.SegmentUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;

  if (definition) {
    // workspaceId is hard-injected here too, same as create — never read from
    // the client-supplied definition.
    const identities = await evaluateSegment(db, workspaceId, definition as SegmentFilterDefinition);
    data.definition = definition;
    data.lastEvaluatedAt = new Date();
    data.cachedCount = identities.length;
  }

  const updated = await db.segment.update({ where: { id }, data });
  return NextResponse.json({ segment: updated });
}

/** SegmentSnapshotMember rows cascade-delete via the schema relation
 *  (onDelete: Cascade) — no manual cleanup needed. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;
  const { id } = await params;

  const segment = await db.segment.findFirst({ where: { id, workspaceId } });
  if (!segment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.segment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
