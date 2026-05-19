import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteEventSeries, updateEventSeries, SeriesError, seriesErrorStatus } from '@/lib/series';
import { UpdateSeriesSchema, toUpdateSeriesInput } from '@/lib/series-schema';

/** GET /api/operator/series/[id] — one series with its generated Event instances. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const series = await db.eventSeries.findFirst({ where: { id, workspaceId } });
  if (!series) return NextResponse.json({ error: 'Series not found' }, { status: 404 });

  const instances = await db.event.findMany({
    where: { workspaceId, seriesId: id },
    orderBy: { startAt: 'asc' },
    select: { id: true, slug: true, title: true, startAt: true, status: true, instanceNumber: true },
  });

  return NextResponse.json({ series, instances });
}

/** PATCH /api/operator/series/[id] — update a series. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = UpdateSeriesSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const series = await updateEventSeries(workspaceId, userId, id, toUpdateSeriesInput(parsed.data));
    return NextResponse.json({ series });
  } catch (err) {
    if (err instanceof SeriesError) {
      return NextResponse.json({ error: err.message }, { status: seriesErrorStatus(err.code) });
    }
    throw err;
  }
}

/** DELETE /api/operator/series/[id] — delete a series with no captured orders. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  try {
    await deleteEventSeries(workspaceId, userId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SeriesError) {
      return NextResponse.json({ error: err.message }, { status: seriesErrorStatus(err.code) });
    }
    throw err;
  }
}
