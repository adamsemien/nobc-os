import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { generateEventDescription } from '@/lib/ai/event-description';

/** POST /api/operator/events/generate-description — drafts a short event (or
 *  series) description in NoBC voice from the event facts. STAFF-gated. The
 *  generation itself lives in lib/ai/event-description.ts, shared with the
 *  compose flow's description sidecar - one generator, two call sites. */
const BodySchema = z.object({
  title: z.string().min(1).max(200),
  location: z.string().max(200).optional().nullable(),
  startAt: z.string().optional().nullable(),
  currentDescription: z.string().max(4000).optional().nullable(),
  kind: z.enum(['event', 'series']).default('event'),
});

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
    const description = await generateEventDescription(prompt);
    if (!description) return NextResponse.json({ error: 'Empty response' }, { status: 502 });
    return NextResponse.json({ description });
  } catch (err) {
    console.error('[events/generate-description] AI generation failed:', err);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
