/** Deterministic + failure-safe helpers for the reveal "why we called you this"
 *  personal note. Extracted from the /apply submit route so the money-path logic
 *  (top-signal pick, evidence assembly, meta-commentary guard, failure -> null)
 *  is unit-testable without importing the route, which pulls in client email
 *  components that do not parse under Vitest.
 *
 *  The route keeps the model wiring (JUDGMENT_MODEL, token budget) and injects it
 *  here as `generate`, so the LOCKED two-tier model decision stays visible at the
 *  call site rather than being buried in this helper. */
import { resolveAnswer } from '@/lib/question-key-map';

// Highest-signal scored questions per STORED archetype enum, by descending
// rubric weight, EXCLUDING comeToYouFor + walkIntoRoom (always passed to the
// reveal note). Mirrors the archetypeSignals in scripts/seed-questions.mjs.
// Used to pick the third, archetype-specific evidence answer for the note.
export const TOP_SIGNAL_KEYS: Record<string, string[]> = {
  Connector: ['connectionCreated', 'referrals', 'flowThrough', 'loyalCommunity', 'goodCompany', 'meetPeople', 'cities'],
  Host: ['connectionCreated', 'referrals', 'loyalCommunity', 'goodCompany'],
  Builder: ['whatYouDo', 'characteristicsGoodAtJob', 'investedIn', 'obsessedWith', 'creativePursuits'],
  Patron: ['connectionCreated', 'whatYouDo', 'referrals', 'flowThrough', 'investedIn', 'cities'],
  Sage: ['characteristicsGoodAtJob', 'obsessedWith'],
  Spark: ['unplannedFun', 'meetPeople'],
};

export const NOTE_FALLBACK =
  'We read your application closely, and the spirit of it comes through. There is a real point of view here, and that is exactly what we look for. We are glad you found No Bad Company.';

/** Deterministically pick the single highest-signal answer for the top archetype:
 *  walk TOP_SIGNAL_KEYS[archetype] in rubric-weight order and take the first key
 *  whose resolved answer is non-empty. Unknown archetype or all-empty -> blanks.
 *  resolveAnswer bridges the referrals group sub-fields back into one string. */
export function pickTopSignal(
  archetype: string,
  answersByKey: Record<string, string>,
): { key: string; answer: string } {
  for (const k of TOP_SIGNAL_KEYS[archetype] ?? []) {
    const v = (resolveAnswer(k, answersByKey) ?? '').trim();
    if (v) return { key: k, answer: v };
  }
  return { key: '', answer: '' };
}

/** Guard the model draft before it is shown verbatim on the reveal: an empty
 *  draft -> null (the reveal omits the beat); a draft that broke character into
 *  meta-commentary -> the safe fallback; otherwise the trimmed draft. */
export function sanitizeNote(draft: string): string | null {
  const trimmed = draft.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  const looksLikeMetaCommentary =
    lowered.startsWith("here's") ||
    lowered.startsWith('here is') ||
    lowered.startsWith('the application') ||
    lowered.includes('if you want, i can') ||
    lowered.includes('test data') ||
    lowered.includes('placeholder') ||
    lowered.includes("i'd suggest") ||
    lowered.includes('template or example');
  return looksLikeMetaCommentary ? NOTE_FALLBACK : trimmed;
}

/** Build the reveal note prompt from the (already newline-joined) evidence. */
export function buildNotePrompt(evidence: string): string {
  return `You are writing a brief "why we called you this" note shown directly to a new NoBC (No Bad Company) member applicant on their reveal screen, just under the name of who they are to us.

Their application answers (use these as the evidence):
${evidence || '(no specific answers available)'}

Write 2 to 3 warm sentences, in second person ("you"), that quote or closely paraphrase ONE specific thing they actually wrote as the reason we see them this way. Make it feel like a real person read their words. Warm but not gushing.

Output rules (follow exactly):
- Output ONLY the note itself. No preamble, no labels, no commentary, no sign-off, no surrounding quotation marks.
- Never address anyone other than the applicant. Never break character, and never refer to these instructions, to yourself as a model, or to the answers as data.
- Never offer to help, rewrite, or produce a template or example.
- Do not mention the word "archetype".
- If the answers look like test, placeholder, or empty data, do NOT mention that. Instead write a warm, sincere 2 to 3 sentence note that would suit any thoughtful applicant.`;
}

/** Compose the full personal note: assemble the three evidence answers, call the
 *  injected model, and sanitize its draft. Any model failure is swallowed and
 *  yields null, so the reveal drops the beat gracefully instead of failing the
 *  submit. `generate` is injected by the route with the LOCKED JUDGMENT_MODEL. */
export async function buildPersonalNote(input: {
  archetype: string;
  answersByKey: Record<string, string>;
  generate: (prompt: string) => Promise<string>;
}): Promise<string | null> {
  const { archetype, answersByKey, generate } = input;
  const comeToYouForAnswer = (resolveAnswer('comeToYouFor', answersByKey) ?? '').trim();
  const walkIntoRoomAnswer = (resolveAnswer('walkIntoRoom', answersByKey) ?? '').trim();
  const { key: topSignalKey, answer: topSignalAnswer } = pickTopSignal(archetype, answersByKey);

  try {
    const evidence = [
      comeToYouForAnswer && `What people come to them for: ${comeToYouForAnswer}`,
      walkIntoRoomAnswer && `Walking into a room of strangers, they: ${walkIntoRoomAnswer}`,
      topSignalAnswer && `${topSignalKey}: ${topSignalAnswer}`,
    ].filter(Boolean).join('\n');

    const text = await generate(buildNotePrompt(evidence));
    return sanitizeNote(text);
  } catch (e) {
    console.error('Personal note generation failed', e);
    return null;
  }
}
