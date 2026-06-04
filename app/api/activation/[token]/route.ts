/**
 * POST /api/activation/[token] — record a sponsor booth interaction (Phase 2a activation loop).
 *
 * Public; the shared booth token (a GeneratedAsset of type activation_booth) carries the
 * event + sponsor. Each submit is an anonymous SurveyResponse(phase = ACTIVATION). A captured
 * contact_email stays on the row for the operator's sponsor hand-off and never enters the recap.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ACTIVATION_QUESTIONS, resolveBoothToken } from '@/lib/intelligence/activation';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { answers?: Record<string, unknown> } | null;
  if (!body || typeof body.answers !== 'object' || body.answers == null) {
    return NextResponse.json({ error: 'answers required' }, { status: 400 });
  }

  const booth = await resolveBoothToken(token);
  if (!booth) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const allowed = new Set(ACTIVATION_QUESTIONS.map((q) => q.key));
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(body.answers)) {
    if (!(allowed.has(k) || k.startsWith('cq_'))) continue; // default keys + sponsor-scoped questions
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
    else if (typeof v === 'string') clean[k] = v.slice(0, 500);
  }

  await db.surveyResponse.create({
    data: {
      workspaceId: booth.workspaceId,
      eventId: booth.eventId,
      sponsorBrandId: booth.sponsorBrandId,
      phase: 'ACTIVATION',
      answers: clean,
      submittedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
