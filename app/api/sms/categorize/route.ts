import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// House Phone topic categorization. Assigns each uncategorized INBOUND message
// one topic label. The Intelligence tab calls this (debounced) on load, then
// refetches analytics.
//
// MODEL NOTE: this uses claude-haiku-4-5-20251001 (the MECHANICAL_MODEL tier,
// lib/ai/runtime-models.ts), correct for cheap high-volume SMS classification.
// Kept inline; House Phone runtime is not repointed. Per CLAUDE.md, model bumps
// and tier moves are Adam's call.
const CATEGORIZE_MODEL = 'claude-haiku-4-5-20251001';

// Bound latency + cost per request. Remaining messages are picked up on the
// next call (the tab re-triggers on load).
const BATCH = 25;

const CATEGORIES = [
  'Guest List',
  'Parking',
  'Timing & Doors',
  'General Question',
  'RSVP Help',
  'Venue Info',
  'Other',
] as const;

const CategorizationSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().describe('The message number shown in the list.'),
      category: z.enum(CATEGORIES),
    }),
  ),
});

const SYSTEM = `You categorize inbound SMS messages sent to the "House Phone" of NoBC, a premium curated member club and event operator. Members and guests text this number with questions about events.

Assign each message exactly one category:
- Guest List: adding/checking names, +1s, who's coming, "put me on the list".
- Parking: parking, valet, where to park, garages, rideshare drop-off.
- Timing & Doors: start/end time, doors, "what time", "am I too late", late arrival.
- RSVP Help: confirming/changing/cancelling attendance, tickets, "am I confirmed".
- Venue Info: address, location, directions, what to wear, dress code, age policy.
- General Question: a real question that fits none of the above.
- Other: greetings, thanks, one-word replies, spam, or anything not a topical question.

Return one result per message using the message's number (index). Choose the single best fit.`;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const uncategorized = await db.smsMessage.findMany({
    where: { direction: 'INBOUND', category: null, conversation: { workspaceId } },
    select: { id: true, body: true },
    orderBy: { createdAt: 'desc' },
    take: BATCH,
  });

  const remainingBefore = await db.smsMessage.count({
    where: { direction: 'INBOUND', category: null, conversation: { workspaceId } },
  });

  if (uncategorized.length === 0) {
    return NextResponse.json({ categorized: 0, remaining: 0 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // No-op gracefully (mirrors lib/ai/tag-application.ts) so the tab still loads.
    return NextResponse.json({ categorized: 0, remaining: remainingBefore, skipped: true });
  }

  const list = uncategorized
    .map((m, i) => `${i}. ${m.body.replace(/\s+/g, ' ').trim().slice(0, 280)}`)
    .join('\n');

  const { object } = await generateObject({
    model: anthropic(CATEGORIZE_MODEL),
    schema: CategorizationSchema,
    system: SYSTEM,
    prompt: `Categorize these ${uncategorized.length} messages:\n\n${list}`,
  });

  // Group ids by category, then one updateMany per category.
  const idsByCategory = new Map<string, string[]>();
  for (const r of object.results) {
    const msg = uncategorized[r.index];
    if (!msg) continue;
    const arr = idsByCategory.get(r.category) ?? [];
    arr.push(msg.id);
    idsByCategory.set(r.category, arr);
  }

  let categorized = 0;
  for (const [category, ids] of idsByCategory) {
    const res = await db.smsMessage.updateMany({ where: { id: { in: ids } }, data: { category } });
    categorized += res.count;
  }

  return NextResponse.json({
    categorized,
    remaining: Math.max(0, remainingBefore - categorized),
  });
}
