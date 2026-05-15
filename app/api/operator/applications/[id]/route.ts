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
  const substantiveAnswers = answerQuestions
    .filter(q => !consentKeys.has(q.key) && !skipRight.has(q.key))
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
    },
  });
}
