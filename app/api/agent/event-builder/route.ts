import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceId } from '@/lib/auth';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

const EventDraftSchema = z.object({
  title: z.string().describe('Short, compelling event title'),
  description: z.string().describe('2-3 paragraph event description in NoBC voice — exclusive, warm, specific'),
  runOfShow: z.array(z.string()).describe('Ordered list of run-of-show bullet points'),
  suggestedLocation: z.string().optional().describe('Location suggestion if inferable from prompt'),
  suggestedStartTime: z.string().optional().describe('ISO 8601 datetime suggestion if inferable'),
});

export type EventDraft = z.infer<typeof EventDraftSchema>;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await requireWorkspaceId(userId);

  const { prompt } = (await req.json()) as { prompt: string };
  if (!prompt?.trim()) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-6'),
    schema: EventDraftSchema,
    prompt: `You are a creative director for No Bad Company, a premium curated member club.

Generate event copy for this event concept: "${prompt}"

NoBC voice: sophisticated but not stuffy, exclusive but warm, specific and evocative.
Write as if inviting your smartest, most interesting friends to something they'll actually want to attend.`,
  });

  return NextResponse.json({ draft: object });
}
