import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { scoreApplication } from '@/lib/scoring';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const application = await db.application.findUnique({
    where: { id },
    include: { answers: true },
  });
  if (!application) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Question-agnostic AI scoring — driven by the template's QuestionDefinitions.
  const result = await scoreApplication(id);

  const answersText = application.answers
    .map((a) => `${a.questionKey}: ${a.answer}`)
    .join('\n');

  let personalizedCopy = '';
  try {
    const personPrompt = `You are writing a brief, personalized reveal message for a new NoBC (No Bad Company) member application.

Their archetype is: ${result.archetype}

Their application answers:
${answersText}

Write 2-3 sentences that feel like we truly read their application and see them. Be specific to their actual answers. Warm but not gushing. Write in second person ("you"). Do not mention the word "archetype". Do not be generic.`;

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      prompt: personPrompt,
      maxOutputTokens: 200,
    });
    personalizedCopy = text.trim();
  } catch (e) {
    console.error('Personalization failed', e);
  }

  await db.application.update({
    where: { id },
    data: {
      archetype: result.archetype,
      archetypeScores: result.archetypeScores,
      aiTags: result.tags,
      // scoreApplication returns memberWorthTotal on a 0–100 scale; canonical
      // aiScore is 0–1. Scale at the persistence boundary only.
      aiScore: result.memberWorthTotal / 100,
      aiRecommendation: result.aiRecommendation,
      aiReasoning: result.aiReasoning,
      personalizedCopy,
    },
  });

  return NextResponse.json({
    archetype: result.archetype,
    archetypeScores: result.archetypeScores,
    dimensionScores: result.dimensionScores,
    memberWorthTotal: result.memberWorthTotal,
    tags: result.tags,
    personalizedCopy,
  });
}
