/**
 * POST /api/survey/[token] — record a brand-lift survey submission.
 *
 * Public (the token is the credential). Accepts only the keys defined for the response's phase,
 * writes them to SurveyResponse.answers, and stamps submittedAt. Idempotent-ish: a second submit
 * is refused (409). No PII is stored — answers are scale/recall/NPS/quote values only.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { questionsFor } from '@/lib/intelligence/survey';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { answers?: Record<string, unknown> } | null;
  if (!body || typeof body.answers !== 'object' || body.answers == null) {
    return NextResponse.json({ error: 'answers required' }, { status: 400 });
  }

  const sr = await db.surveyResponse.findUnique({
    where: { token },
    select: { id: true, phase: true, submittedAt: true },
  });
  if (!sr) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sr.submittedAt) return NextResponse.json({ error: 'Already submitted' }, { status: 409 });

  const allowed = new Set(questionsFor(sr.phase === 'PRE' ? 'PRE' : 'POST').map((q) => q.key));
  const clean: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(body.answers)) {
    if (!allowed.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
    else if (typeof v === 'string') clean[k] = v.slice(0, 500);
  }

  await db.surveyResponse.update({
    where: { id: sr.id },
    data: { answers: clean, submittedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
