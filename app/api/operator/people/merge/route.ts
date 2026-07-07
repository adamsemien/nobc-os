import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { executePersonMerge, type PersonMergeError } from '@/lib/crm/person-merge';

/** Human-readable refusals. two_linked_accounts deliberately points at nothing
 *  (D1): there is no resolution path today — if it happens for real it goes to
 *  Adam, not through an operator override. */
const ERROR_RESPONSES: Record<PersonMergeError, { status: number; error: string }> = {
  same_person: { status: 400, error: 'Survivor and duplicate are the same record.' },
  not_found: { status: 404, error: 'Person not found in this workspace.' },
  already_merged: { status: 409, error: 'One of these records was already merged.' },
  both_have_members: {
    status: 409,
    error:
      'Both records have a membership profile. Membership-level duplicates are resolved with the Member merge tool — this merge was halted.',
  },
  two_linked_accounts: {
    status: 409,
    error:
      'Each record is linked to a different signed-up account. Two accounts means two people — these records cannot be merged.',
  },
};

// Executing a merge is ADMIN-territory; STAFF can view the queue and dismiss.
export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.ADMIN);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

  const body = await req.json().catch(() => null);
  const survivorId = typeof body?.survivorId === 'string' ? body.survivorId : '';
  const loserId = typeof body?.loserId === 'string' ? body.loserId : '';
  if (!survivorId || !loserId) {
    return NextResponse.json({ error: 'survivorId and loserId are required' }, { status: 400 });
  }

  try {
    const result = await executePersonMerge({ workspaceId, survivorId, loserId, actorId: userId });
    if (!result.ok) {
      const mapped = ERROR_RESPONSES[result.error];
      return NextResponse.json({ error: mapped.error, code: result.error }, { status: mapped.status });
    }
    return NextResponse.json({
      survivorId: result.survivorId,
      loserId: result.loserId,
      repointed: result.repointed,
    });
  } catch (err) {
    console.error(
      `[people/merge] merge failed (workspace=${workspaceId} survivor=${survivorId} loser=${loserId}):`,
      err,
    );
    return NextResponse.json({ error: 'Merge failed — nothing was changed.' }, { status: 500 });
  }
}
