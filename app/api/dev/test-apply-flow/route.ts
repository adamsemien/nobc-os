import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { JUDGMENT_MODEL } from '@/lib/ai/runtime-models';
import type { AiApplicationRecommendation } from '@prisma/client';

// Development-only route — verifies the full apply → AI scoring pipeline.
// Hit GET /api/dev/test-apply-flow to run it.
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development' }, { status: 403 });
  }

  const workspace = await db.workspace.findFirst();
  if (!workspace) return NextResponse.json({ error: 'No workspace found' }, { status: 500 });

  // Create a test application
  const testEmail = `test-flow-${Date.now()}@nobc-dev.test`;
  const application = await db.application.create({
    data: {
      workspaceId: workspace.id,
      fullName: 'Test Applicant',
      email: testEmail,
      phone: null,
      city: 'Austin',
      referredBy: 'dev-test-flow',
      consentEmail: false,
      consentSms: false,
    },
  });

  // Create sample answers
  const sampleAnswers = {
    what_do_you_do: 'I build software products and invest in early-stage startups.',
    why_nobc: 'Looking for a community of makers and builders in Austin.',
    bring_to_community: 'I run a weekly founder dinner and can host events.',
    describe_yourself: 'Builder, connector, community organizer.',
    referred_by: 'A mutual friend in the Austin tech scene.',
  };

  await Promise.all(
    Object.entries(sampleAnswers).map(([questionKey, answer]) =>
      db.applicationAnswer.create({ data: { applicationId: application.id, questionKey, answer } }),
    ),
  );

  // Run AI scoring
  const answersText = Object.entries(sampleAnswers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const scoringPrompt = `You are scoring a membership application for NoBC (No Bad Company), an exclusive Austin social club.

Based on these application answers, score the applicant 0-100 for each of these 6 member archetypes:
- Connector: bridges people, makes introductions, knows everyone
- Host: creates environments and experiences, brings people together
- Curator: identifies quality, shapes taste, influences what's cool
- Builder: ships products, builds companies, makes things happen
- Maker: creates with craft — art, food, music, design, writing
- Patron: resources and enables others, invests in people and culture

Application answers:
${answersText}

Also generate 3-5 single-word or short-phrase tags that capture this person's vibe/identity.
Generate a 1-sentence recommendation: APPROVE, WAITLIST, or REJECT.
Generate personalized copy (2 sentences) describing who this person is to the NoBC community.

Respond ONLY with valid JSON:
{
  "scores": { "Connector": 0, "Host": 0, "Curator": 0, "Builder": 0, "Maker": 0, "Patron": 0 },
  "primaryArchetype": "Builder",
  "tags": ["founder", "builder", "connector"],
  "recommendation": "APPROVE",
  "reasoning": "Strong builder with community focus.",
  "personalizedCopy": "Two sentences about this person."
}`;

  let aiResult: Record<string, unknown> | null = null;
  let aiError: string | null = null;

  try {
    const { text } = await generateText({
      model: anthropic(JUDGMENT_MODEL),
      messages: [{ role: 'user', content: scoringPrompt }],
      maxOutputTokens: 512,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      aiResult = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      const scores = aiResult.scores as Record<string, number> | undefined;
      if (scores) {
        await db.application.update({
          where: { id: application.id },
          data: {
            aiScore: scores[aiResult.primaryArchetype as string] ?? null,
            aiTags: aiResult.tags as string[],
            aiRecommendation: (aiResult.recommendation as AiApplicationRecommendation | null) ?? null,
            aiReasoning: aiResult.reasoning as string,
            personalizedCopy: aiResult.personalizedCopy as string,
          },
        });
      }
    }
  } catch (err) {
    aiError = err instanceof Error ? err.message : 'AI scoring failed';
  }

  // Clean up test data
  await db.applicationAnswer.deleteMany({ where: { applicationId: application.id } });
  await db.application.delete({ where: { id: application.id } });

  return NextResponse.json({
    ok: true,
    applicationId: application.id,
    workspaceId: workspace.id,
    aiResult,
    aiError,
    note: 'Test application created, scored, and cleaned up. AI result above.',
  });
}
