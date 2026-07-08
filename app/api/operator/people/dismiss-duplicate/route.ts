import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';

const MATCH_TYPES = new Set(['flagged', 'email', 'phone']);

/** NOT A DUPLICATE (STAFF, D2). Clears any potentialDuplicateOfId flag between
 *  the pair and records a `person.duplicate_dismissed` audit event carrying
 *  BOTH person ids and the match type — the queue excludes dismissed pairs by
 *  that metadata (zero-DDL persistence), and a wrong dismissal stays
 *  reconstructable even without a UI undo. */
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  const personAId = typeof body?.personAId === 'string' ? body.personAId : '';
  const personBId = typeof body?.personBId === 'string' ? body.personBId : '';
  const matchType = MATCH_TYPES.has(body?.matchType) ? (body.matchType as string) : 'flagged';
  if (!personAId || !personBId || personAId === personBId) {
    return NextResponse.json({ error: 'Two distinct person ids are required' }, { status: 400 });
  }

  const found = await db.person.count({
    where: { id: { in: [personAId, personBId] }, workspaceId },
  });
  if (found !== 2) {
    return NextResponse.json({ error: 'Person not found in this workspace.' }, { status: 404 });
  }

  // Clear the intake flag in whichever direction it points (if at all —
  // read-time email/phone pairs may carry no flag).
  await db.person.updateMany({
    where: { workspaceId, id: personAId, potentialDuplicateOfId: personBId },
    data: { potentialDuplicateOfId: null },
  });
  await db.person.updateMany({
    where: { workspaceId, id: personBId, potentialDuplicateOfId: personAId },
    data: { potentialDuplicateOfId: null },
  });

  await db.auditEvent.create({
    data: {
      workspaceId,
      actorId: userId,
      action: 'person.duplicate_dismissed',
      entityType: 'PERSON',
      entityId: personAId,
      metadata: { personAId, personBId, matchType },
    },
  });

  return NextResponse.json({ dismissed: true });
}
