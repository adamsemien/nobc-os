import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText } from 'ai';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { anthropic } from '@ai-sdk/anthropic';

/** POST /api/operator/events/generate-description — drafts a short event (or
 *  series) description in NoBC voice from the event facts. STAFF-gated; uses the
 *  workspace's resolved (locked Sonnet) model via the existing AI SDK pattern. */
const BodySchema = z.object({
  title: z.string().min(1).max(200),
  location: z.string().max(200).optional().nullable(),
  startAt: z.string().optional().nullable(),
  currentDescription: z.string().max(4000).optional().nullable(),
  kind: z.enum(['event', 'series']).default('event'),
});

const SYSTEM = `You write event descriptions for No Bad Company (NoBC), a premium curated members' club and event operator.

Voice:
- Atmospheric and specific — evoke the room, the night, and the people in it.
- Confident and understated. Never hype, never corporate, never salesy.
- No clichés ("join us", "don't miss out", "unforgettable", "curated experience"), no emoji, no exclamation marks.
- Concrete over generic — anchor to the actual event, place, and moment.

Output: 2-3 sentences. Plain prose only — no title, no markdown, no surrounding quotes, no preamble. Return only the description text.`;

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 422 });
  const { title, location, startAt, currentDescription, kind } = parsed.data;

  const facts: string[] = [`${kind === 'series' ? 'Series' : 'Event'} name: ${title}`];
  if (location) facts.push(`Location: ${location}`);
  if (startAt) {
    const d = new Date(startAt);
    if (!Number.isNaN(d.getTime())) {
      facts.push(
        `Date: ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
      );
    }
  }
  if (currentDescription && currentDescription.trim()) {
    facts.push(`Existing draft to build on (sharpen it, don't merely repeat it): ${currentDescription.trim()}`);
  }

  const prompt = `Write a description for this ${
    kind === 'series' ? 'recurring event series' : 'event'
  }:\n\n${facts.join('\n')}`;

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: SYSTEM,
      prompt,
      maxOutputTokens: 300,
      temperature: 0.8,
    });
    const description = text.trim();
    if (!description) return NextResponse.json({ error: 'Empty response' }, { status: 502 });
    return NextResponse.json({ description });
  } catch (err) {
    console.error('[events/generate-description] AI generation failed:', err);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
