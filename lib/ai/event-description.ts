import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { JUDGMENT_MODEL } from '@/lib/ai/runtime-models';
import { toBrandPunctuation } from '@/lib/text/sanitize-copy';

/** The ONE event-description generator - shared by the "Generate with AI"
 *  button (POST /api/operator/events/generate-description) and the compose
 *  flow's description sidecar (lib/builder/compose.ts). One voiced prompt,
 *  one model, one output-cleaning pipeline; never fork a second copy of this
 *  logic. Model: JUDGMENT_MODEL per the locked two-tier policy.
 *
 *  Copy law: the prompt below uses spaced hyphens, never em dashes - the old
 *  relocated prompt carried em dashes and the model echoed them into
 *  member-facing prose. toBrandPunctuation guarantees the output either way. */
const SYSTEM = `You write event descriptions for No Bad Company (NoBC), a premium curated members' club and event operator.

Voice:
- Atmospheric and specific - evoke the room, the night, and the people in it.
- Confident and understated. Never hype, never corporate, never salesy.
- No clichés ("join us", "don't miss out", "unforgettable", "curated experience"), no emoji, no exclamation marks.
- Concrete over generic - anchor to the actual event, place, and moment.
- Punctuation: spaced hyphens (" - "), never em dashes.

Output: 2-3 sentences. Plain prose only - no title, no markdown, no surrounding quotes, no preamble. Return only the description text.`;

/** Model output is not member-facing copy until it is unwrapped and
 *  stripped: a conversational preamble ("Here is the description:"), a
 *  trailing metadata block ("--- **Resolved datetime:** 2026-07-12T..."),
 *  or surrounding quotes must never reach a stored description. */
function stripModelWrapper(raw: string): string {
  let text = raw.trim();
  // Everything from a --- separator onward is model scratch, not prose.
  const cut = text.search(/\s*-{3,}/);
  if (cut !== -1) text = text.slice(0, cut).trim();
  // Leading conversational preamble.
  text = text.replace(
    /^(?:here(?:'s|’s| is)\s+(?:the\s+|a\s+|your\s+)?description|description)\s*:\s*/i,
    '',
  );
  // Surrounding quotes when the whole answer is wrapped in them.
  const quoted = text.match(/^"([\s\S]+)"$/);
  if (quoted) text = quoted[1];
  return text.trim();
}

/** Draft a description from caller-assembled facts (the prompt). The return
 *  passes through the cleaning pipeline - unwrap preamble/quotes, strip any
 *  trailing metadata block, then toBrandPunctuation - so BOTH callers get
 *  clean brand-compliant prose. Possibly empty; callers decide how to treat
 *  an empty draft. Model-call failures propagate to the caller. */
export async function generateEventDescription(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: anthropic(JUDGMENT_MODEL),
    system: SYSTEM,
    prompt,
    maxOutputTokens: 300,
    temperature: 0.8,
  });
  return toBrandPunctuation(stripModelWrapper(text)).trim();
}
