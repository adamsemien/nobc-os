/**
 * Recap prose narrative.
 *
 * The model writes ONLY prose — it is handed numbers that are already computed in code and
 * told to use them verbatim and invent nothing. If ANTHROPIC_API_KEY is unset or the call
 * fails, a deterministic templated narrative (built from the same numbers) is returned, so
 * a recap is ALWAYS renderable.
 *
 * MODEL: claude-haiku-4-5-20251001. Adam authorized Haiku for "the recap's prose narrative"
 * as an explicit sponsor-summarization exception in the Sponsor Intelligence build task
 * (2026-06-01). This does not relax the Sonnet lock anywhere else.
 */
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

const NARRATIVE_MODEL = 'claude-haiku-4-5-20251001'; // authorized recap-narrative exception (see header)

const NarrativeSchema = z.object({
  coverStandfirst: z.string().describe('one sentence under the cover title that frames the night'),
  audienceSummary: z.string().describe('who they reached, in human terms — 2-3 sentences'),
  awarenessSummary: z.string().describe('the reach + media-value story — 2-3 sentences'),
  activationSummary: z.string().describe('turnout + how the room engaged — 2-3 sentences'),
  renewal: z.string().describe('warm, specific recommendation for next year — 2-3 sentences'),
});

export type RecapNarrative = z.infer<typeof NarrativeSchema>;

export interface NarrativeInput {
  sponsorName: string;
  eventName: string;
  dateLabel: string;
  declaredObjectives: string | null;
  attended: number;
  registered: number;
  overallScanRatePct: number;
  aggregateInfluenceScore: number;
  topTierLabel: string;
  topTierPct: number;
  qualifiedExecMixPct: number;
  personaMatchPct: number | null;
  headlineValueLabel: string; // already-formatted, e.g. "$248,000"
  valueVsFeeMultiple: number | null;
  deliverablesVerified: number;
  deliverablesTotal: number;
}

function fallbackNarrative(i: NarrativeInput): RecapNarrative {
  const feeLine = i.valueVsFeeMultiple
    ? ` — roughly ${i.valueVsFeeMultiple}× what you invested`
    : '';
  const personaLine =
    i.personaMatchPct != null ? ` ${i.personaMatchPct}% of them matched the audience you came for.` : '';
  return {
    coverStandfirst: `A close-read of ${i.sponsorName}'s night at ${i.eventName} — who was in the room, what it was worth, and where it goes next.`,
    audienceSummary: `You were in front of ${i.attended} of Austin's most considered people, with an aggregate influence score of ${i.aggregateInfluenceScore} out of 100 — ${i.topTierPct}% of the room were ${i.topTierLabel}.${personaLine}`,
    awarenessSummary: `The night generated an estimated ${i.headlineValueLabel} in equivalent media value${feeLine}. That is the cost of buying this audience's attention through paid channels — except here you earned it in person, in a room you helped create.`,
    activationSummary: `${i.attended} of ${i.registered} confirmed guests turned up (${i.overallScanRatePct}%), and ${i.deliverablesVerified} of ${i.deliverablesTotal} of your deliverables are verified with photography on file.`,
    renewal: `We would put ${i.sponsorName} back in the room next year, and earlier — claiming the moments that drew the most attention and building the activation around the audience you most want to reach.`,
  };
}

export async function generateRecapNarrative(i: NarrativeInput): Promise<RecapNarrative> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackNarrative(i);

  const system = `You are the editorial voice of No Bad Company, a premium curated members club in Austin, Texas. You are writing the prose for a sponsor's activation recap — a document that should read like a letter from a trusted partner, not a marketing deck. Voice: warm, confident, specific, quietly authoritative. British restraint. No exclamation marks. No hype words (no "amazing", "incredible", "thrilled", "excited", "leverage", "synergy"). Address the sponsor in the second person ("you", "your brand"). Short sentences. Never use the word "RSVP".

CRITICAL: You are given numbers that are ALREADY COMPUTED. Use ONLY these numbers. Never invent a figure, never re-round, never add a statistic that is not provided. You write the prose around the numbers; you never produce a number.`;

  const prompt = `Sponsor: ${i.sponsorName}
Event: ${i.eventName} (${i.dateLabel})
Their stated objectives: ${i.declaredObjectives ?? 'not specified'}

Computed results you may reference (do not alter, do not add to):
- ${i.attended} attended of ${i.registered} confirmed (${i.overallScanRatePct}% turned up)
- Aggregate influence score ${i.aggregateInfluenceScore}/100; ${i.topTierPct}% of the room were ${i.topTierLabel}
- Qualified-executive mix ${i.qualifiedExecMixPct}%${i.personaMatchPct != null ? `; ${i.personaMatchPct}% matched their target persona` : ''}
- Equivalent media value (headline): ${i.headlineValueLabel}${i.valueVsFeeMultiple ? ` — ${i.valueVsFeeMultiple}× their rights fee` : ''}
- Deliverables verified: ${i.deliverablesVerified} of ${i.deliverablesTotal}

Write five short prose passages (no headers, no lists, 1-3 sentences each):
1. coverStandfirst — the single sentence under the cover title that frames the night.
2. audienceSummary — who they reached, in human terms.
3. awarenessSummary — the reach + equivalent-media-value story.
4. activationSummary — turnout + how the room engaged.
5. renewal — a warm, specific recommendation for next year. Never mention any internal score, churn, or risk.`;

  try {
    const { object } = await generateObject({
      model: anthropic(NARRATIVE_MODEL),
      schema: NarrativeSchema,
      system,
      prompt,
      temperature: 0.7,
      maxOutputTokens: 800,
    });
    return object;
  } catch (e) {
    console.error('[recap-narrative] generation failed; using templated fallback:', e);
    return fallbackNarrative(i);
  }
}
