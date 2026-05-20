import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { Persona } from '@/lib/dev/persona-types';

const ALLOWED = (process.env.DEV_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SYSTEM_PROMPT = `Generate realistic test personas for a curated member club in Austin TX called No Bad Company. The application asks about work, what they're building, neighborhood, brands they care about, why they want to join, what they bring. Return ONLY valid JSON matching this schema: { fullName, email (use [firstname].[lastname]+test@example.com), phone (512 or 737), city: 'Austin, TX', neighborhood (real Austin neighborhood), homeAddress, whereFrom, birthday (YYYY-MM-DD, age 25-45), workWebsite, referredBy, whatYouDo (2-3 sentences in their voice), passionProjects, brandsYouLove (4-6 real brands matching persona), whyNobc, contribution, rapidFire: { sundayMorning, karaokeOrder, ifNotHere }, archetype_lean (Connector/Host/Curator/Builder/Maker/Patron) }. Vary writing style, depth, demographics, work types. 30% borderline candidates.`;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { archetype?: string; tier?: string; scenario?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let userPrompt = 'Generate one persona now.';
  if (body.scenario && body.scenario.trim()) {
    userPrompt = `Scenario: ${body.scenario.trim()}\n\nGenerate one persona that fits this scenario.`;
  } else if (body.archetype) {
    userPrompt = `Archetype lean: ${body.archetype}. Generate one persona.`;
  }

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 1024,
      temperature: 0.95,
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: 'AI returned non-JSON response', raw: text }, { status: 502 });
    }
    const persona = JSON.parse(match[0]) as Persona;
    return NextResponse.json({ persona });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'AI generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
