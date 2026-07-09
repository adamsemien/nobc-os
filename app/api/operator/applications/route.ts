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
import { buildAnswerResolver, type AnswerResolver } from '@/lib/apply/resolve-application-answers';
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

function resolveAnswers(
  resolver: AnswerResolver,
  answers: { questionKey: string; answer: string }[],
): { answers: Record<string, string>; answerLabels: Record<string, string> } {
  const answersOut: Record<string, string> = {};
  const answerLabels: Record<string, string> = {};
  for (const a of answers) {
    answersOut[a.questionKey] = resolver.value(a.questionKey, a.answer);
    answerLabels[a.questionKey] = resolver.label(a.questionKey);
  }
  return { answers: answersOut, answerLabels };
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

  // Resolve option-backed answers to their human labels/values, same as the
  // detail route. Applications can span several templates, so build one
  // resolver per distinct templateId (instead of per application) to avoid
  // an N+1 questionDefinition query per row.
  const distinctTemplateIds = Array.from(new Set(rows.map(app => app.templateId)));
  const resolverByTemplateId = new Map<string | null, AnswerResolver>();
  await Promise.all(
    distinctTemplateIds.map(async templateId => {
      resolverByTemplateId.set(templateId, await buildAnswerResolver(workspaceId, templateId));
    }),
  );

  const applications = rows.map(app => {
    const resolver = resolverByTemplateId.get(app.templateId)!;
    const { answers, answerLabels } = resolveAnswers(resolver, app.answers);
    return {
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
      answers,
      answerLabels,
    };
  });

  return NextResponse.json({
    applications,
    pendingCount,
    counts: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount, hold: holdCount },
  });
}
