import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import { answerQuestions } from '@/lib/apply-config';
import { referrerLines } from '@/lib/operator-application-display';

const QUESTION_LABELS = new Map(answerQuestions.map(q => [q.key, q.label]));
const QUESTION_ORDER = new Map(answerQuestions.map((q, i) => [q.key, i]));

/** Question keys span generations: bare camelCase from the current /apply form,
 *  dotted `section.field` from older forms, and snake_case from the seed
 *  generator. Resolve a human label from the current config, else prettify the
 *  raw key so the panel never shows a bare DB key. */
function prettyKey(key: string): string {
  const cleaned = key.replace(/^_+/, '').replace(/[._]+/g, ' ').trim();
  if (!cleaned) return key;
  const lower = cleaned.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function answerLabel(key: string): string {
  return QUESTION_LABELS.get(key) ?? prettyKey(key);
}

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
  const referrerKeys = new Set(['referrer2', 'referrer3', 'referrer4']);
  // Anything underscore-prefixed is system metadata (e.g. `_photos`), not Q&A.
  const isSystemKey = (k: string) => k.startsWith('_');

  // Render the answer rows that actually exist on this application, keyed by
  // each row's own questionKey — NOT a fixed allow-list. Matching against a
  // fixed key list dropped every row whose key didn't match (seed snake_case,
  // older dotted keys) to an empty "—". Consents and referrers have their own
  // sections, so they're excluded here.
  const substantiveAnswers = app.answers
    .filter(
      a =>
        !consentKeys.has(a.questionKey) &&
        !referrerKeys.has(a.questionKey) &&
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
      label: answerLabel(a.questionKey),
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
