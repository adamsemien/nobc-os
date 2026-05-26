import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import '@/lib/intelligence'; // registers every metric
import { buildContext, DEFAULT_FILTER_STATE, type IntelligenceFilterState } from '@/lib/intelligence/filters';
import { composeInsight } from '@/lib/intelligence/composer';

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { workspaceId } = gate;

  let body: { question?: unknown; filters?: Partial<IntelligenceFilterState> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const question = String(body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });

  const filters: IntelligenceFilterState = { ...DEFAULT_FILTER_STATE, ...(body.filters ?? {}) };
  const ctx = buildContext(workspaceId, filters);

  try {
    const composition = await composeInsight(question, ctx);
    return NextResponse.json(composition);
  } catch (e) {
    console.error('[compose] failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Composition failed' },
      { status: 500 },
    );
  }
}
