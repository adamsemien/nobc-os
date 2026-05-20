import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { answerQuestions } from '@/lib/apply-config';
import { referrerLines } from '@/lib/operator-application-display';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const { id } = await params;

  const app = await db.application.findUnique({
    where: { id },
    include: { answers: true },
  });

  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (app.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const consentKeys = new Set(['consentMembershipRead', 'consentPhotos']);
  const skipRight = new Set(['referrer2', 'referrer3', 'referrer4']);
  // Anything underscore-prefixed is system metadata (e.g. `_photos`), not Q&A.
  const isSystemKey = (k: string) => k.startsWith('_');
  const substantiveAnswers = answerQuestions
    .filter(q => !consentKeys.has(q.key) && !skipRight.has(q.key) && !isSystemKey(q.key))
    .map(q => {
      const row = app.answers.find(a => a.questionKey === q.key);
      return {
        questionKey: q.key,
        label: q.label,
        answer: row?.answer ?? '',
      };
    });

  const consentAnswers = answerQuestions
    .filter(q => consentKeys.has(q.key))
    .map(q => {
      const row = app.answers.find(a => a.questionKey === q.key);
      return {
        questionKey: q.key,
        label: q.label,
        checked: String(row?.answer ?? '').toLowerCase() === 'true' || row?.answer === 'on',
      };
    });

  // `_photos` is a synthetic answer holding a JSON array of portrait URLs.
  // The detail UI renders up to 5 in a strip.
  let photos: string[] = [];
  const photoRow = app.answers.find((a) => a.questionKey === '_photos');
  if (photoRow) {
    try {
      const parsed = JSON.parse(photoRow.answer) as unknown;
      if (Array.isArray(parsed)) {
        photos = parsed
          .filter((v): v is string => typeof v === 'string' && /^https?:\/\//.test(v))
          .slice(0, 5);
      }
    } catch {}
  }

  return NextResponse.json({
    application: {
      id: app.id,
      fullName: app.fullName,
      email: app.email,
      phone: app.phone,
      city: app.city,
      status: app.status,
      createdAt: app.createdAt.toISOString(),
      reviewedAt: app.reviewedAt?.toISOString() ?? null,
      rejectionReason: app.rejectionReason ?? null,
      consentEmail: app.consentEmail,
      consentSms: app.consentSms,
      referrers: referrerLines(app.referredBy, app.answers),
      substantiveAnswers,
      consentAnswers,
      aiScore: app.aiScore,
      aiRecommendation: app.aiRecommendation,
      aiReasoning: app.aiReasoning,
      archetype: app.archetype,
      archetypeScores: app.archetypeScores as Record<string, number> | null,
      photos,
    },
  });
}
