/**
 * Fixture data for the operator-only Apply Preview (`app/apply/preview/page.tsx`,
 * `MembershipForm`'s `previewMode` prop). Every value below is deliberately
 * fake and clearly labeled as such — no real applicant is ever represented
 * here, none of it is sourced from the DB, and none of it is ever sent over
 * the network. Answers are a deliberate PARTIAL fill (not every question) so
 * operators can see both the filled and the empty/required-field states.
 *
 * Keyed to the current question set (app/apply/_lib/questions.ts): the address
 * group writes homeAddress.{street,city,state,zip}, referrals write first/last
 * sub-keys, and the reveal reflects the six-archetype cast.
 */

export const PREVIEW_ANSWERS: Record<string, string> = {
  firstName: 'Preview',
  lastName: 'Fixture',
  email: 'preview-fixture@example.test',
  cell: '000-000-0000',
  'homeAddress.street': '[preview fixture] 100 Example St',
  'homeAddress.city': 'Austin',
  'homeAddress.state': 'Texas',
  'homeAddress.zip': '78701',
  cities: '[preview fixture - example cities]',
  'birthInfo.birthDate': '1990-01-01',
  'birthInfo.birthCity': '[preview fixture]',
  gender: 'Prefer not to say',
  whatYouDo: '[PREVIEW FIXTURE] Example answer for operator review - not a real applicant response.',
  characteristicsGoodAtJob: '[PREVIEW FIXTURE] Example answer for operator review.',
  creativePursuits: '[PREVIEW FIXTURE] Example answer for operator review.',
  'referrals.referral1First': '[preview]',
  'referrals.referral1Last': '[fixture]',
  enneagram: '5 - The Investigator',
  mbti: 'INTJ',
  loveLanguage: 'Quality Time',
  obsessedWith: '[PREVIEW FIXTURE] Example answer for operator review.',
  recommendForPay: '[PREVIEW FIXTURE] Example answer for operator review.',
  comeToYouFor: '[PREVIEW FIXTURE] Example answer for operator review.',
  walkIntoRoom: '[PREVIEW FIXTURE] Example answer for operator review.',
  unplannedFun: '[PREVIEW FIXTURE] Example answer for operator review.',
  meetPeople: '[PREVIEW FIXTURE] Example answer for operator review.',
  workout: '[preview fixture]',
  goodCompany: '[PREVIEW FIXTURE] Example answer for operator review.',
  connectionCreated: '[PREVIEW FIXTURE] Example answer for operator review.',
  chapter: '[PREVIEW FIXTURE] Example answer for operator review.',
  investedIn: '[PREVIEW FIXTURE] Example answer for operator review.',
  // Remaining required fields (dietary, links.*, loyalCommunity, flowThrough,
  // otherTests, nominate) are left unanswered on purpose, so the preview also
  // shows the empty/required-field state exactly as production renders it.
  // Photos are files, not answers — the picker simply stays empty in preview.
};

/** Shape mirrors `SubmitResult` in MembershipForm.tsx without importing it. */
export interface PreviewReveal {
  archetype: string;
  archetypeScores: Record<string, number>;
  tags: string[];
  personalNote: string;
  rsvpId?: string | null;
  memberQrCode?: string | null;
}

/**
 * Fabricated reveal, computed entirely client-side. This is NEVER the output
 * of scoreApplication or any Anthropic call — the archetype copy (oneLiner and
 * the who-you-are / the-cost / how-you-move beats) is real production copy from
 * config/archetypes.ts (that's what operators need to review), but the scores,
 * tags, and personal note are hardcoded and unmistakably fake. A Sage top with a
 * Connector runner-up so operators see the reveal AND the blend line.
 */
export const PREVIEW_REVEAL: PreviewReveal = {
  archetype: 'Sage',
  archetypeScores: {
    Sage: 84,
    Connector: 66,
    Host: 52,
    Builder: 44,
    Patron: 38,
    Spark: 30,
  },
  tags: ['preview fixture', 'not a real applicant'],
  personalNote:
    '[PREVIEW FIXTURE] This note is a hardcoded example for operator review. No AI call was made and no real applicant exists.',
  rsvpId: null,
  memberQrCode: 'PREVIEW-FIXTURE-NOT-A-REAL-MEMBER-QR',
};
