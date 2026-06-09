import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { answerQuestions } from '@/lib/apply-config';
import { referrerLines } from '@/lib/operator-application-display';
import { resolveAnswerLabel } from '@/lib/legacy-answer-labels';
import { isPortraitRef, portraitSrc } from '@/lib/apply-photo';

const QUESTION_ORDER = new Map(answerQuestions.map((q, i) => [q.key, i]));

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
  // Referrers (live form: basics.referrers JSON array; older: referrer2/3/4)
  // render in the Referrers section, not as Q&A rows.
  const referrerKeys = new Set(['referrer2', 'referrer3', 'referrer4', 'basics.referrers']);
  // Photos render as a strip, not a Q&A row (live form: photos.urls JSON array).
  const photoKeys = new Set(['photos.urls']);
  // Anything underscore-prefixed is system metadata (e.g. `_photos`), not Q&A.
  const isSystemKey = (k: string) => k.startsWith('_');

  // Render the answer rows that actually exist on this application, keyed by
  // each row's own questionKey — NOT a fixed allow-list. Matching against a
  // fixed key list dropped every row whose key didn't match (seed snake_case,
  // older dotted keys) to an empty "—". Consents, referrers, and photos have
  // their own sections, so they're excluded here.
  const substantiveAnswers = app.answers
    .filter(
      a =>
        !consentKeys.has(a.questionKey) &&
        !referrerKeys.has(a.questionKey) &&
        !photoKeys.has(a.questionKey) &&
        !isSystemKey(a.questionKey) &&
        typeof a.answer === 'string' &&
        a.answer.trim() !== '',
    )
    .sort(
      (x, y) =>
        (QUESTION_ORDER.get(x.questionKey) ?? Number.MAX_SAFE_INTEGER) -
        (QUESTION_ORDER.get(y.questionKey) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(a => ({
      questionKey: a.questionKey,
      label: resolveAnswerLabel(a.questionKey),
      answer: a.answer,
    }));

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

  // Portraits: the live form stores a JSON array under `photos.urls`; older seed
  // rows used the synthetic `_photos` key. Each entry is either a private R2 key
  // (served via the presign proxy) or a full URL (legacy/demo). The detail UI
  // renders up to 5.
  let photos: string[] = [];
  const photoRow =
    app.answers.find((a) => a.questionKey === 'photos.urls') ??
    app.answers.find((a) => a.questionKey === '_photos');
  if (photoRow) {
    try {
      const parsed = JSON.parse(photoRow.answer) as unknown;
      if (Array.isArray(parsed)) {
        photos = parsed.filter(isPortraitRef).map(portraitSrc).slice(0, 5);
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
