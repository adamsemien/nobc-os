import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { JUDGMENT_MODEL } from '@/lib/ai/runtime-models';

/** The ONE event-description generator - shared by the "Generate with AI"
 *  button (POST /api/operator/events/generate-description) and the compose
 *  flow's description sidecar (lib/builder/compose.ts). One voiced prompt,
 *  one model, one place to change either; never fork a second copy of this
 *  logic. Model: JUDGMENT_MODEL per the locked two-tier policy. */
const SYSTEM = `You write event descriptions for No Bad Company (NoBC), a premium curated members' club and event operator.

Voice:
- Atmospheric and specific — evoke the room, the night, and the people in it.
- Confident and understated. Never hype, never corporate, never salesy.
- No clichés ("join us", "don't miss out", "unforgettable", "curated experience"), no emoji, no exclamation marks.
- Concrete over generic — anchor to the actual event, place, and moment.

Output: 2-3 sentences. Plain prose only — no title, no markdown, no surrounding quotes, no preamble. Return only the description text.`;

/** Draft a description from caller-assembled facts (the prompt). Returns the
 *  trimmed text - possibly empty; callers decide how to treat an empty draft.
 *  Model-call failures propagate to the caller. */
export async function generateEventDescription(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: anthropic(JUDGMENT_MODEL),
    system: SYSTEM,
    prompt,
    maxOutputTokens: 300,
    temperature: 0.8,
  });
  return text.trim();
}
