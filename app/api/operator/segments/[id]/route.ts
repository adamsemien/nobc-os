import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { resolveSegmentPopulation } from '@/lib/segments/evaluate';

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
