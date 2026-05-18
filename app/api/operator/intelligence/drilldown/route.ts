import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireWorkspaceId } from '@/lib/auth';
import { buildContext, getDrillDown, parseFilters } from '@/lib/intelligence';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const url = new URL(req.url);
  const metricId = url.searchParams.get('metric');
  if (!metricId) return NextResponse.json({ error: 'metric query param required' }, { status: 400 });

  const filters = parseFilters(url.searchParams);
  const ctx = buildContext(workspaceId, filters);

  try {
    const rows = await getDrillDown(metricId, ctx);
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
