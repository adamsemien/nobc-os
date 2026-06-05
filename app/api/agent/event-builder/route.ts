import { NextRequest, NextResponse } from 'next/server';
import { OperatorRole } from '@prisma/client';
import { requireRole } from '@/lib/operator-role';
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

// AI Event Builder — single structured generation. The model proposes a draft
// event scaffold; it writes nothing to the DB and registers no tools. The operator
// reviews + edits the draft in /operator/events/new, then the EXISTING create
// routes commit it (POST /api/operator/events, POST /api/operator/ticket-tiers).
//
// NOTE: there is intentionally no `status` field on this schema. The generator
// never decides publish state — the create flow defaults to DRAFT and the review
// UI submits DRAFT. Publishing stays a separate, explicit operator action.

// Custom-question type vocabulary mirrors CreateSchema.CustomQuestionInput in
// app/api/operator/events/route.ts so the draft maps straight onto the create flow.
const DraftQuestionSchema = z.object({
  label: z.string().describe('The question shown to the registrant'),
  type: z
    .enum(['text', 'textarea', 'select', 'multiselect', 'checkbox', 'date', 'email', 'phone'])
    .describe('Field type. Use select/multiselect only when you also provide options.'),
  required: z.boolean().describe('Whether an answer is required'),
  options: z.array(z.string()).optional().describe('Choices for select/multiselect'),
});

// Ticket-tier draft mirrors the purchasable subset of CreateTierSchema
// (lib/ticketing/tier-schema.ts). Prices are in cents. Only emit tiers when the
// event is TICKETED; leave empty/omit for OPEN events.
const DraftTierSchema = z.object({
  name: z.string().describe('Tier name, e.g. "General", "Early Bird", "Patron"'),
  description: z.string().optional().describe('Short line on what this tier includes'),
  memberPriceCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Member price in cents (e.g. 5000 = $50). Omit if members do not buy this tier.'),
  nonMemberPriceCents: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Guest/non-member price in cents. Omit if guests do not buy this tier.'),
  quantity: z.number().int().positive().describe('Inventory available for this tier'),
});

const EventDraftSchema = z.object({
  title: z.string().describe('Short, compelling event title'),
  slug: z.string().describe('URL slug: lowercase letters, numbers, hyphens only'),
  description: z
    .string()
    .describe('2-3 paragraph event description in NoBC voice — exclusive, warm, specific'),
  startDatetime: z.string().optional().describe(
    'ISO 8601 datetime for event start. Always use year 2026 if no year specified. ' +
      'Parse AM/PM from context — morning/brunch/breakfast events default AM, evening/dinner/party default PM. ' +
      'Example: 2026-08-15T20:30:00 for 8:30 PM on Aug 15 2026.'
  ),
  endDatetime: z.string().optional().describe(
    'ISO 8601 datetime for event end. If duration is inferable (e.g. "dinner" = ~2h, "party" = ~4h), include it.'
  ),
  location: z.string().optional().describe('Venue name and/or address if inferable'),
  capacity: z.number().int().positive().optional().describe('Expected headcount if inferable'),
  accessMode: z.enum(['OPEN', 'TICKETED']).optional().describe(
    'OPEN for free community events, TICKETED for paid'
  ),
  approvalRequired: z
    .boolean()
    .optional()
    .describe('True when access should be gated behind operator approval (apply-to-attend)'),
  plusOnesAllowed: z
    .boolean()
    .optional()
    .describe('True when attendees may bring a plus-one'),
  template: z.enum(['editorial', 'split', 'minimal']).optional().describe(
    'editorial for hero-forward events with strong imagery, split for brand-focused events, minimal for intimate/exclusive events'
  ),
  customQuestions: z
    .array(DraftQuestionSchema)
    .optional()
    .describe('Registration fields to ask attendees. Only when the concept implies them.'),
  ticketTiers: z
    .array(DraftTierSchema)
    .optional()
    .describe('Ticket tiers. Only for TICKETED events; omit for OPEN events.'),
  announcementDraft: z
    .string()
    .describe(
      'A short announcement/invitation the operator can review and reuse. NoBC voice, ' +
        'see the announcement rules in the prompt. Max ~3 short paragraphs.'
    ),
  sponsorName: z
    .string()
    .optional()
    .describe('A sponsor or partner brand named in the concept (e.g. "Humano pouring" → "Humano"). Name only.'),
});

export type EventDraft = z.infer<typeof EventDraftSchema>;

export async function POST(req: NextRequest) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;

  const { prompt } = (await req.json()) as { prompt: string };
  if (!prompt?.trim()) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: EventDraftSchema,
    prompt: `You are a creative director for No Bad Company, a premium curated member club. Today is ${today}.

Generate a complete event draft for this concept: "${prompt}"

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
- Include both start AND end datetime when duration is reasonably inferable

Access rules:
- TICKETED + ticket tiers when a price is mentioned; OPEN with no tiers for free community events
- approvalRequired: true when the concept implies an application or curated guest list
- Only emit customQuestions when the concept clearly calls for them (e.g. dietary needs, plus-one names)
- Only emit ticketTiers for TICKETED events. Prices are in cents. Match the number of tiers to the concept.
- If a sponsor or pouring partner is named, set sponsorName to the brand name only

Announcement rules (the announcementDraft field) — follow exactly:
- No em dashes anywhere. Use periods and short sentences.
- Short declarative sentences. No hedging, no filler.
- Say "Access" or "Get Access", never "RSVP".
- Refer to the club as "No Bad Company" or "NoBC". Never write "NBC".
- Keep it to at most three short paragraphs. It is a draft for an operator to review, not a sent message.`,
  });

  // status is never taken from the model — the draft is always reviewed and
  // committed as DRAFT through the existing create flow.
  return NextResponse.json(object);
}
