/** Brand punctuation law: spaced hyphens, never em dashes. This is the
 *  deterministic guarantee for AI-generated copy - prompts ask the model not
 *  to emit em dashes; this makes it true even when the model slips. */

/** Replace em (U+2014) and en (U+2013) dashes with a single spaced hyphen,
 *  collapsing any surrounding whitespace: "word — word", "word—word", and
 *  "word – word" all become "word - word". Regular hyphens are untouched.
 *  Pure and idempotent. */
export function toBrandPunctuation(input: string): string {
  return input.replace(/\s*[–—]\s*/g, " - ");
}
