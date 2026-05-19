import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { createEventSeries, listEventSeries, SeriesError, seriesErrorStatus } from '@/lib/series';
import { CreateSeriesSchema, toCreateSeriesInput } from '@/lib/series-schema';

/** GET /api/operator/series — list every series in the workspace. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const series = await listEventSeries(workspaceId);
  return NextResponse.json({ series });
}

/** POST /api/operator/series — create a recurring series. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = CreateSeriesSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const series = await createEventSeries(workspaceId, userId, toCreateSeriesInput(parsed.data));
    return NextResponse.json({ series }, { status: 201 });
  } catch (err) {
    if (err instanceof SeriesError) {
      return NextResponse.json({ error: err.message }, { status: seriesErrorStatus(err.code) });
    }
    throw err;
  }
}
