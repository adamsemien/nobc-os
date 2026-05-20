import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

const GateSuggestionSchema = z.object({
  type: z.enum(['application', 'ticket', 'rsvp', 'referral', 'waitlist', 'age_check', 'custom_question']),
  label: z.string(),
  approvalRequired: z.boolean().optional(),
  priceCents: z.number().int().min(0).optional(),
  question: z.string().optional(),
  questionType: z.enum(['yes_no', 'short_text']).optional(),
});

const EventBuildSchema = z.object({
  title: z.string().describe('Short, compelling event title'),
  slug: z.string().describe('URL slug: lowercase letters, numbers, hyphens only'),
  description: z.string().describe('2-3 sentence event description in NoBC voice — exclusive, warm, specific'),
  startDatetime: z.string().optional().describe(
    'ISO 8601 datetime for event start. Always use year 2026 if no year specified. ' +
    'Morning/brunch → AM; evening/dinner/party → PM. Example: 2026-08-15T20:30:00',
  ),
  endDatetime: z.string().optional().describe('ISO 8601 datetime for event end.'),
  venue: z.string().optional().describe('Venue name and/or address if inferable'),
  capacity: z.number().int().positive().optional().describe('Expected headcount if inferable'),
  accessMode: z.enum(['OPEN', 'TICKETED']).optional().describe(
    'OPEN for free, TICKETED for paid (combine with approvalRequired: true to gate purchase behind operator approval)',
  ),
  template: z.enum(['editorial', 'split', 'minimal']).optional(),
  memberGates: z.array(GateSuggestionSchema).describe('Ordered gates for members to pass through'),
  guestGates: z.array(GateSuggestionSchema).describe('Ordered gates for guests to pass through'),
  suggestedQuestions: z.array(z.object({
    label: z.string(),
    type: z.enum(['text', 'textarea', 'yes_no', 'select']),
    options: z.array(z.string()).optional(),
    required: z.boolean(),
  })).optional().describe('Registration questions if an application gate is present'),
  coverImagePrompt: z.string().describe('Text description for generating a cover image — evocative, specific, visual'),
  tags: z.array(z.string()).max(6).describe('Short topic tags for this event'),
});

export type EventBuildResult = z.infer<typeof EventBuildSchema>;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await requireWorkspaceId(userId);

  const { prompt } = (await req.json()) as { prompt: string };
  if (!prompt?.trim()) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: EventBuildSchema,
    prompt: `You are a creative director for No Bad Company (NoBC), a premium curated member club. Today is ${today}.

Generate a complete event structure for this concept: "${prompt}"

NoBC voice: sophisticated but not stuffy, exclusive but warm, specific and evocative. Write as if inviting your smartest, most interesting friends.

Gate guidance:
- "members only" / "NoBC members" / "curated" / "application" → application gate for members
- "ticketed" / "$XX" / "paid" → ticket gate with that price
- "referral" → referral gate
- "waitlist" → waitlist gate
- "18+" / "21+" → age_check gate (use custom_question for 21+ with "Are you 21 or older?")
- Free community events → rsvp gate
- Guests (non-members) buying tickets → ticket gate for guests
- If no access specified, default to application gate for members, rsvp for guests

Date rules:
- Always use year 2026 unless explicitly stated otherwise
- Parse AM/PM from context — morning/brunch/breakfast → AM, evening/dinner/party/cocktails → PM
- If time given without AM/PM: check context. "9:30" alone → 9:30 AM. "7:00" dinner context → 7:00 PM
- No time given + evening context → 8:00 PM
- No time given + daytime context → 11:00 AM
- Include endDatetime when duration is inferable (dinner ~2.5h, party ~4h, brunch ~2h)

Template guidance:
- editorial: hero-forward with strong photography / visual storytelling
- minimal: intimate or exclusive events, understated luxury
- split: brand-forward events with a strong logo/identity`,
  });

  return NextResponse.json(object);
}
