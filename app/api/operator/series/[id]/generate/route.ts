import { OperatorRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/operator-role';
import { generateInstances, SeriesError, seriesErrorStatus } from '@/lib/series';

/** POST /api/operator/series/[id]/generate — expand the RRULE into Event instances. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  try {
    const result = await generateInstances(workspaceId, userId, id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SeriesError) {
      return NextResponse.json({ error: err.message }, { status: seriesErrorStatus(err.code) });
    }
    throw err;
  }
}
