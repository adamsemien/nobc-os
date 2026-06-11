import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { getMemberConnections } from '@/lib/crm/connections';

/**
 * GET /api/operator/members/[id]/connections
 *
 * Returns the MemberConnections contract: referral edges, plus-one edges,
 * and top co-attendees flattened to a labelled connections list.
 *
 * Auth: any authenticated workspace member (no role floor — reads are open).
 * Workspace scoping: workspaceId derived server-side from requireWorkspaceId(userId).
 * Member ownership: getMemberConnections verifies memberId belongs to workspaceId
 * before any derivation; a foreign memberId returns { connections: [] }.
 *
 * No AI calls. No schema changes.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await requireWorkspaceId(userId);
  const { id: memberId } = await params;

  const connections = await getMemberConnections(workspaceId, memberId);

  return NextResponse.json(connections);
}
