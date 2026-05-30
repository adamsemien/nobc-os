import { OperatorRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/operator-role';
import { addSeriesInstance, SeriesError, seriesErrorStatus } from '@/lib/series';

const AddInstanceSchema = z.object({
  startAt: z.string().datetime(),
  title: z.string().max(200).optional().nullable(),
  capacity: z.number().int().positive().optional().nullable(),
});

/** POST /api/operator/series/[id]/instances — add a single ad-hoc instance to a
 *  series, inheriting the series defaults. The events POST route does not accept
 *  seriesId/instanceNumber, so series-scoped instance creation lives here. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = AddInstanceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const instance = await addSeriesInstance(workspaceId, userId, id, {
      startAt: new Date(parsed.data.startAt),
      title: parsed.data.title,
      capacity: parsed.data.capacity,
    });
    return NextResponse.json({ instance }, { status: 201 });
  } catch (err) {
    if (err instanceof SeriesError) {
      return NextResponse.json({ error: err.message }, { status: seriesErrorStatus(err.code) });
    }
    throw err;
  }
}
