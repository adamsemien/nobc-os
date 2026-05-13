import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { db } from '@/lib/db';
import { ApplySchema, answerQuestions } from '@/lib/apply-config';

const TagSchema = z.object({ tags: z.array(z.string()) });

const SUBSTANTIVE_KEYS = new Set(['workingOn', 'greatEnergy', 'learnedThisYear', 'meetPeople']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Invalid request.' },
      { status: 400 },
    );
  }

  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'error', message: 'Please fill in all required fields.' },
      { status: 400 },
    );
  }
  const data = parsed.data as Record<string, string | boolean | undefined>;

  const workspace = await db.workspace.findUnique({ where: { slug } });
  if (!workspace) {
    return NextResponse.json(
      { status: 'error', message: 'Not found.' },
      { status: 404 },
    );
  }

  const email = data.email as string;

  const existing = await db.application.findFirst({
    where: {
      workspaceId: workspace.id,
      email,
      status: { in: ['PENDING', 'APPROVED', 'HOLD'] },
    },
  });
  if (existing) {
    return NextResponse.json({ status: 'already_applied' });
  }

  // Split "full name" → firstName + lastName
  const fullName = ((data.fullName as string) ?? '').trim();
  const spaceIdx = fullName.indexOf(' ');
  const firstName = spaceIdx >= 0 ? fullName.slice(0, spaceIdx) : fullName;
  const lastName = spaceIdx >= 0 ? fullName.slice(spaceIdx + 1) : '';

  const redListed = await db.member.findFirst({
    where: { workspaceId: workspace.id, email, redListed: true },
  });
  if (redListed) {
    await db.application.create({
      data: {
        workspaceId: workspace.id,
        email,
        firstName,
        lastName,
        phone: data.phone as string | undefined,
        city: data.city as string | undefined,
        referredBy: data.referredBy as string | undefined,
        consentEmail: (data.consentEmail as boolean) ?? false,
        consentSms: (data.consentSms as boolean) ?? false,
        status: 'REJECTED',
        aiTags: [],
      },
    });
    return NextResponse.json({ status: 'success' });
  }

  const application = await db.$transaction(async tx => {
    const app = await tx.application.create({
      data: {
        workspaceId: workspace.id,
        email,
        firstName,
        lastName,
        phone: data.phone as string | undefined,
        city: data.city as string | undefined,
        referredBy: data.referredBy as string | undefined,
        consentEmail: (data.consentEmail as boolean) ?? false,
        consentSms: (data.consentSms as boolean) ?? false,
        status: 'PENDING',
        aiTags: [],
      },
    });

    await Promise.all(
      answerQuestions.map(q =>
        tx.applicationAnswer.create({
          data: {
            applicationId: app.id,
            questionKey: q.key,
            answer: String(data[q.key] ?? ''),
          },
        }),
      ),
    );

    return app;
  });

  try {
    const answerContext = answerQuestions
      .filter(q => SUBSTANTIVE_KEYS.has(q.key))
      .map(q => `${q.label}:\n${String(data[q.key] ?? '')}`)
      .join('\n\n');

    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: TagSchema,
      prompt: `Extract 3–8 short descriptive tags from this No Bad Company membership application. Cover: industry/profession, personality/vibe signals, referral source, seniority signals, and location context. Tags should be lowercase, 1–3 words each, useful for filtering applicants.

Applicant: ${firstName} ${lastName}
City: ${(data.city as string) || 'not provided'}
How they heard about us: ${(data.referredBy as string) || 'not provided'}

${answerContext}`,
    });

    await db.application.update({
      where: { id: application.id },
      data: { aiTags: object.tags },
    });
  } catch (err) {
    console.error('[apply] AI tagging failed:', err);
  }

  return NextResponse.json({ status: 'success' });
}
