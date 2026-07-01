// AI scoring (archetype, score, aiRecommendation) only runs on applications
// submitted through /apply. Seed-generated applications have no AI data —
// aiScore will be null and the AI profile section will be empty. This is expected.
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireWorkspaceId } from '@/lib/auth';
import {
  firstAnswerPreview,
  referrerCount,
} from '@/lib/operator-application-display';
import type { ApplicationStatus } from '@prisma/client';

function parseStatus(param: string | null): ApplicationStatus[] | 'ALL' {
  const s = (param ?? 'pending').toLowerCase();
  if (s === 'all') return 'ALL';
  if (s === 'approved') return ['APPROVED'];
  if (s === 'rejected') return ['REJECTED'];
  if (s === 'hold') return ['HOLD'];
  if (s === 'pending') return ['PENDING'];
  return ['PENDING'];
}

function answersRecord(
  answers: { questionKey: string; answer: string }[],
): Record<string, string> {
  return Object.fromEntries(answers.map(a => [a.questionKey, a.answer]));
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  const statusParam = req.nextUrl.searchParams.get('status');
  const filter = parseStatus(statusParam);

  const where =
    filter === 'ALL'
      ? { workspaceId }
      : { workspaceId, status: { in: filter } };

  const [rows, pendingCount, approvedCount, rejectedCount, holdCount] = await Promise.all([
    db.application.findMany({
      where,
      include: { answers: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.application.count({ where: { workspaceId, status: 'PENDING' } }),
    db.application.count({ where: { workspaceId, status: 'APPROVED' } }),
    db.application.count({ where: { workspaceId, status: 'REJECTED' } }),
    db.application.count({ where: { workspaceId, status: 'HOLD' } }),
  ]);

  const applications = rows.map(app => ({
    id: app.id,
    fullName: app.fullName,
    email: app.email,
    city: app.city,
    phone: app.phone,
    submittedAt: app.createdAt.toISOString(),
    status: app.status,
    // Phase C: the email opt-in now lives on `emailOptIn` (the member apply flow
    // stopped writing legacy `consentEmail`); read it so the queue reflects the
    // real opt-in. Transport key stays `consentEmail` (display unchanged).
    consentEmail: app.emailOptIn,
    consentSms: app.consentSms,
    firstAnswerPreview: firstAnswerPreview(app.answers),
    referrerCount: referrerCount(app.referredBy, app.answers),
    aiTags: app.aiTags,
    aiScore: app.aiScore,
    aiRecommendation: app.aiRecommendation,
    aiReasoning: app.aiReasoning,
    archetype: app.archetype,
    archetypeScores: app.archetypeScores as Record<string, number> | null,
    referredBy: app.referredBy,
    answers: answersRecord(app.answers),
  }));

  return NextResponse.json({
    applications,
    pendingCount,
    counts: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount, hold: holdCount },
  });
}
