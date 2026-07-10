import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ContactRole, ContactSourceSystem, MemberStatus, OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { requireRole } from '@/lib/operator-role';
import { evaluateSegment, type SegmentFilterDefinition } from '@/lib/segments/evaluate';

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

// Every primitive here maps to real, queryable data as of Slices 0-3 (Slice 4
// recon). `q`/`source`/`verified`/`membership`/`consent` mirror the
// People-list's own filters exactly (app/operator/people/page.tsx).
const FilterDefinitionSchema = z
  .object({
    q: z.string().max(200).optional(),
    source: z.nativeEnum(ContactSourceSystem).optional(),
    verified: z.enum(['verified', 'unverified']).optional(),
    membership: z.enum(['member', 'none']).optional(),
    consent: z.enum(['subscribed', 'none']).optional(),
    role: z.nativeEnum(ContactRole).optional(),
    organizationId: z.string().optional(),
    membershipStatus: z.nativeEnum(MemberStatus).optional(),
    tagId: z.string().optional(),
    customField: z.object({ stableKey: z.string(), value: z.string() }).optional(),
    firmographic: z
      .object({
        field: z.enum([
          'industry',
          'jobFunction',
          'seniority',
          'companySize',
          'city',
          'country',
          'companyName',
        ]),
        value: z.string(),
      })
      .optional(),
    eventId: z.string().optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
  })
  .strict();

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
    await db.segmentSnapshotMember.createMany({
      data: identities.map((i) => ({ segmentId: segment.id, personId: i.personId, memberId: i.memberId })),
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
