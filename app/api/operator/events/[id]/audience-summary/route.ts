import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { getAudienceSummary } from '@/lib/crm/audience-summary';

/**
 * GET /api/operator/events/[id]/audience-summary
 *
 * Returns the AudienceSummary contract for the CRM "Who's coming" panel.
 *
 * Auth: any authenticated workspace member (no role floor — reads are open).
 * Workspace scoping: workspaceId derived from requireWorkspaceId(userId);
 * eventId ownership is verified transitively because Q1 filters on both
 * workspaceId + eventId — a foreign event returns 0 rows, not an error.
 *
 * No AI calls. No schema changes. Pure TS derivation via lib/member-history.ts.
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
  const { id: eventId } = await params;

  const summary = await getAudienceSummary(workspaceId, eventId);

  return NextResponse.json(summary);
}
