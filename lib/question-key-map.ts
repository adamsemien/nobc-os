/** Bridge between canonical QuestionDefinition.stableKey values and the answer
 *  keys the live /apply membership form (MembershipForm.tsx) stores on
 *  ApplicationAnswer.questionKey.
 *
 *  Question-agnostic scoring (lib/scoring.ts) pairs each scored QuestionDefinition
 *  with its applicant answer by stableKey. The membership form stores answers
 *  under its own field ids (MembershipForm / app/apply/_lib/questions.ts), which
 *  differ from the underscore-namespaced stableKeys in scripts/seed-questions.mjs
 *  — and the form was re-sectioned in the 2026-06 rebuild (`real.*` → personality
 *  fields, `your_world` → community fields). This map keeps the two vocabularies
 *  in sync without modifying /apply.
 *
 *  A value may be an array: the resolver joins the non-empty answers (used where a
 *  single scored question maps to several form fields, e.g. the three referrer
 *  slots, which the rebuilt form splits into a group).
 *
 *  Templates created via the question builder store answers under the stableKey
 *  directly, so any key not in this map falls through to identity lookup.
 *
 *  Keep in sync with the scored stableKeys in scripts/seed-questions.mjs and the
 *  field ids in app/apply/_lib/questions.ts. The guard test in
 *  lib/__tests__/question-key-map.test.ts asserts every scored stableKey either
 *  resolves a representative answer set or is on the documented unmapped list. */
export const MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY: Record<string, string | string[]> = {
  // basics
  basics_city: ['homeAddress', 'cities'],
  basics_referrers: ['referrals.referral1', 'referrals.referral2', 'referrals.referral3'],
  // "real questions" — now the personality / what-you-do fields
  real_working_on: ['whatYouDo', 'creativePursuits'],
  real_obsessed_with: 'obsessedWith',
  real_called_about: 'comeToYouFor',
  // "your world" — now the community fields
  world_interesting_people: 'flowThrough',
  world_connected_people: 'connectionCreated',
  world_community_loyalty: 'loyalCommunity',
  // taste
  taste_place_details: 'detailsRight',
  taste_trust_taste: 'trustedTaste',
  taste_recommend_paid: 'recommendForPay',
  taste_splurge_save: 'splurgeSave',
  // rapid fire
  rapid_karaoke: 'karaoke',
  rapid_sunday_morning: 'idealSaturday',
  // Intentionally unmapped — the rebuilt form has no equivalent field, so the
  // scorer reads "no answer provided" for these (graceful, does not break scoring):
  //   rapid_coffee_table  ("what's on your coffee table right now?")
  //   rapid_most_dont_know ("something most people don't know about you")
};

/** Resolve an applicant's answer for a question definition. Checks the bridge
 *  map first (joining multiple fields when the value is an array), then falls
 *  back to the stableKey itself (for new template-builder-driven forms). */
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
