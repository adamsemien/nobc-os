import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { generateInstances, SeriesError, seriesErrorStatus } from '@/lib/series';

/** POST /api/operator/series/[id]/generate — expand the RRULE into Event instances. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
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
