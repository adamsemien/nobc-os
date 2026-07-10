import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { evaluateSegment, type SegmentFilterDefinition } from '@/lib/segments/evaluate';
import { FilterDefinitionSchema } from '@/lib/segments/filter-schema';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await requireWorkspaceId(userId);

  const segments = await db.segment.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ segments });
}

const CreateSegmentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  kind: z.enum(['DYNAMIC', 'STATIC']).default('DYNAMIC'),
  definition: FilterDefinitionSchema,
});

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateSegmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { name, description, kind, definition } = parsed.data;

  // workspaceId is hard-injected by evaluateSegment itself (never read from
  // `definition`) — the caller's own resolved workspace, not client-suppliable.
  const identities = await evaluateSegment(db, workspaceId, definition as SegmentFilterDefinition);

  const segment = await db.segment.create({
    data: {
      workspaceId,
      name,
      description: description ?? null,
      definition,
      kind,
      createdBy: userId,
      lastEvaluatedAt: new Date(),
      cachedCount: identities.length,
    },
  });

  if (kind === 'STATIC' && identities.length > 0) {
    // skipDuplicates guards the rare case of one Person resolving to more than
    // one non-merged Member (evaluateSegment then emits >1 pair sharing that
    // personId) — the out-of-band partial unique indexes on SegmentSnapshotMember
    // (see prisma/sql/segments-slice4.sql) would otherwise reject the insert.
    await db.segmentSnapshotMember.createMany({
      data: identities.map((i) => ({ segmentId: segment.id, personId: i.personId, memberId: i.memberId })),
      skipDuplicates: true,
    });
  }

  // Slice 4 decision: the ONE operator-action write site. Fires on Segment
  // CREATE only — never on edit/re-save (decision 7).
  const action = await db.operatorAction.create({
    data: {
      workspaceId,
      actorId: userId,
      actionType: 'list_built',
      summary: `Built "${name}" — ${identities.length} ${identities.length === 1 ? 'person' : 'people'}`,
      metadata: { segmentId: segment.id, kind },
      targetCount: identities.length,
    },
  });
  if (identities.length > 0) {
    await db.operatorActionTarget.createMany({
      data: identities.map((i) => ({ actionId: action.id, personId: i.personId, memberId: i.memberId })),
    });
  }

  return NextResponse.json({ segment, resolvedCount: identities.length }, { status: 201 });
}
