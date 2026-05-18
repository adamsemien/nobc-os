/** Bridge between canonical QuestionDefinition.stableKey values and the answer
 *  keys the live /apply membership form (MembershipForm.tsx) stores on
 *  ApplicationAnswer.questionKey.
 *
 *  The membership form predates the QuestionDefinition registry and stores
 *  answers under dotted keys (e.g. "real.workingOn"). Question-agnostic scoring
 *  pairs each QuestionDefinition with its applicant answer by stableKey — this
 *  map lets it find legacy-form answers without modifying /apply.
 *
 *  Templates created via the question builder store answers under the stableKey
 *  directly, so any key not in this map falls through to identity lookup. */
export const MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY: Record<string, string> = {
  basics_city: 'basics.city',
  basics_referrers: 'basics.referrers',
  real_working_on: 'real.workingOn',
  real_obsessed_with: 'real.obsessedWith',
  real_called_about: 'real.alwaysCalledAbout',
  world_interesting_people: 'world.interestingPeople',
  world_connected_people: 'world.connectedPeople',
  world_community_loyalty: 'world.loyalCommunity',
  taste_place_details: 'taste.detailsRight',
  taste_trust_taste: 'taste.trustTaste',
  taste_recommend_paid: 'taste.recommend',
  taste_splurge_save: 'taste.splurgeVsSave',
  rapid_karaoke: 'rapid.karaokeS',
  rapid_coffee_table: 'rapid.coffeeTable',
  rapid_sunday_morning: 'rapid.sundayMorning',
  rapid_most_dont_know: 'rapid.everydayItem',
};

/** Resolve an applicant's answer for a question definition. Checks the legacy
 *  bridge map first, then the stableKey itself (for new template-driven forms). */
export function resolveAnswer(
  stableKey: string,
  answersByKey: Record<string, string>,
): string | undefined {
  const bridged = MEMBERSHIP_ANSWER_KEY_BY_STABLE_KEY[stableKey];
  return (bridged ? answersByKey[bridged] : undefined) ?? answersByKey[stableKey];
}
