import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

const EventDraftSchema = z.object({
  title: z.string().describe('Short, compelling event title'),
  slug: z.string().describe('URL slug: lowercase letters, numbers, hyphens only'),
  description: z.string().describe('2-3 paragraph event description in NoBC voice — exclusive, warm, specific'),
  startDatetime: z.string().optional().describe(
    'ISO 8601 datetime for event start. Always use year 2026 if no year specified. ' +
    'Parse AM/PM from context — morning/brunch/breakfast events default AM, evening/dinner/party default PM. ' +
    'Example: 2026-08-15T20:30:00 for 8:30 PM on Aug 15 2026.'
  ),
  endDatetime: z.string().optional().describe(
    'ISO 8601 datetime for event end. If duration is inferable (e.g. "dinner" = ~2h, "party" = ~4h), include it.'
  ),
  venue: z.string().optional().describe('Venue name and/or address if inferable'),
  capacity: z.number().int().positive().optional().describe('Expected headcount if inferable'),
  accessMode: z.enum(['OPEN', 'TICKETED']).optional().describe(
    'OPEN for free community events, TICKETED for paid (set approvalRequired: true to gate purchase behind operator approval)'
  ),
  template: z.enum(['editorial', 'split', 'minimal']).optional().describe(
    'editorial for hero-forward events with strong imagery, split for brand-focused events, minimal for intimate/exclusive events'
  ),
});

export type EventDraft = z.infer<typeof EventDraftSchema>;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await requireWorkspaceId(userId);

  const { prompt } = (await req.json()) as { prompt: string };
  if (!prompt?.trim()) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: EventDraftSchema,
    prompt: `You are a creative director for No Bad Company, a premium curated member club. Today is ${today}.

Generate event details for this concept: "${prompt}"

NoBC voice: sophisticated but not stuffy, exclusive but warm, specific and evocative.
Write as if inviting your smartest, most interesting friends to something they'll actually want to attend.

CRITICAL date/time rules:
- Always use year 2026 unless another year is explicitly stated
- If the user states an explicit time (e.g. "9:30", "10:00", "2pm"), use it EXACTLY — never reinterpret it
- Ambiguous times with no AM/PM qualifier: DEFAULT TO AM unless context is unambiguously evening
- Morning/breakfast/brunch/coffee → AM; Evening/dinner/party/nightlife/cocktails → PM
- "Starts at 9:30" with no other context → 9:30 AM. Do not flip to PM.
- If no time is given and context implies evening, default to 8:00 PM
- If no time is given and context is daytime, default to 11:00 AM
- Include both start AND end datetime when duration is reasonably inferable`,
  });

  return NextResponse.json(object);
}
