import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';

/** List recent saved reports for the workspace. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const reports = await db.savedReport.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({ reports });
}

/** Save a composition as a named report. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  let body: { name?: unknown; question?: unknown; metricIds?: unknown; filters?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim();
  const question = String(body.question ?? '').trim();
  if (!name || !question) {
    return NextResponse.json({ error: 'name and question are required' }, { status: 400 });
  }
  const metricIds = Array.isArray(body.metricIds) ? body.metricIds.map(String) : [];

  const report = await db.savedReport.create({
    data: {
      workspaceId,
      name,
      question,
      metricIds,
      filters: (body.filters ?? {}) as object,
      createdById: userId,
      lastRunAt: new Date(),
    },
  });

  return NextResponse.json({ report }, { status: 201 });
}
