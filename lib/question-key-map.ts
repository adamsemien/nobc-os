/** Bridge for GROUP-type membership questions whose answers are stored under
 *  dotted subfield keys rather than the bare question id.
 *
 *  Question-agnostic scoring (lib/scoring.ts) pairs each scored QuestionDefinition
 *  with its applicant answer by stableKey. As of the 2026-06-23 scoring-model
 *  rebuild (scripts/seed-questions.mjs), every scored QuestionDefinition uses
 *  stableKey === the live /apply form field id (app/apply/_lib/questions.ts), so
 *  simple text questions resolve directly via the identity fallback below - no
 *  mapping needed.
 *
 *  The only exceptions are GROUP questions: the form writes their answers under
 *  `${id}.${subfield}` keys (e.g. referrals.referral1), so a scored group
 *  question maps its stableKey to the list of subfield keys, and resolveAnswer
 *  joins the non-empty parts. Without these entries the group questions would
 *  resolve to "no answer provided" and silently drop out of scoring.
 *
 *  Templates created via the question builder store answers under the stableKey
 *  directly, so any key not in this map falls through to identity lookup.
 *
 *  Keep in sync with the scored GROUP stableKeys in scripts/seed-questions.mjs
 *  and the group field ids in app/apply/_lib/questions.ts. The guard test in
 *  tests/unit/question-key-map.test.ts asserts the group keys join their
 *  subfields and that simple keys resolve by identity. */
export const MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY: Record<string, string | string[]> = {
  referrals: ['referrals.referral1', 'referrals.referral2', 'referrals.referral3'],
  recSources: [
    'recSources.travel',
    'recSources.food',
    'recSources.healthWellness',
    'recSources.beauty',
    'recSources.fashionDesign',
  ],
};

/** Resolve an applicant's answer for a question definition. Checks the bridge
 *  map first (joining multiple subfields when the value is an array), then falls
 *  back to the stableKey itself (the identity path for every simple question and
 *  for template-builder-driven forms). */
export function resolveAnswer(
  stableKey: string,
  answersByKey: Record<string, string>,
): string | undefined {
  const bridged = MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY[stableKey];
  let viaBridge: string | undefined;
  if (Array.isArray(bridged)) {
    const parts = bridged.map((k) => (answersByKey[k] ?? '').trim()).filter(Boolean);
    viaBridge = parts.length ? parts.join('\n') : undefined;
  } else if (bridged) {
    viaBridge = answersByKey[bridged];
  }
  return viaBridge ?? answersByKey[stableKey];
}
