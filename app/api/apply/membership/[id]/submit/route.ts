import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const application = await db.application.findUnique({
    where: { id },
    include: { answers: true },
  });
  if (!application) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const answersText = application.answers
    .map((a) => `${a.questionKey}: ${a.answer}`)
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

Respond ONLY with valid JSON in this exact format:
{
  "scores": {
    "Connector": 0,
    "Host": 0,
    "Curator": 0,
    "Builder": 0,
    "Maker": 0,
    "Patron": 0
  },
  "tags": ["tag1", "tag2", "tag3"],
  "reasoning": "One sentence about why this person belongs"
}`;

  const archetypeResult = {
    scores: { Connector: 50, Host: 50, Curator: 50, Builder: 50, Maker: 50, Patron: 50 } as Record<string, number>,
    tags: [] as string[],
    reasoning: '',
  };
  let topArchetype = 'Connector';

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      prompt: scoringPrompt,
      maxOutputTokens: 500,
    });
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    if (parsed.scores) {
      archetypeResult.scores = parsed.scores;
      archetypeResult.tags = parsed.tags ?? [];
      archetypeResult.reasoning = parsed.reasoning ?? '';
      topArchetype = Object.entries(parsed.scores as Record<string, number>)
        .sort(([, a], [, b]) => b - a)[0][0];
    }
  } catch (e) {
    console.error('Archetype scoring failed', e);
  }

  let personalizedCopy = '';
  try {
    const personPrompt = `You are writing a brief, personalized reveal message for a new NoBC (No Bad Company) member application.

Their archetype is: ${topArchetype}

Their application answers:
${answersText}

Write 2-3 sentences that feel like we truly read their application and see them. Be specific to their actual answers. Warm but not gushing. Write in second person ("you"). Do not mention the word "archetype". Do not be generic.`;

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      prompt: personPrompt,
      maxOutputTokens: 200,
    });
    personalizedCopy = text.trim();
  } catch (e) {
    console.error('Personalization failed', e);
  }

  const topScore = archetypeResult.scores[topArchetype] ?? 50;

  await db.application.update({
    where: { id },
    data: {
      archetype: topArchetype,
      archetypeScores: archetypeResult.scores,
      aiTags: archetypeResult.tags,
      aiScore: Math.round(topScore),
      aiReasoning: archetypeResult.reasoning,
      personalizedCopy,
    },
  });

  return NextResponse.json({
    archetype: topArchetype,
    archetypeScores: archetypeResult.scores,
    tags: archetypeResult.tags,
    personalizedCopy,
  });
}
