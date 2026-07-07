/**
 * Fixture data for the operator-only Apply Preview (`app/apply/preview/page.tsx`,
 * `MembershipForm`'s `previewMode` prop). Every value below is invented - no real
 * applicant is ever represented here, none of it is sourced from the DB, and none
 * of it is ever sent over the network. Most answers are clearly tagged
 * [PREVIEW FIXTURE]; the two reveal-relevant answers the note quotes (walkIntoRoom)
 * and the personalNote itself are written realistically on purpose, so operators
 * review the ACTUAL reveal presentation (a real-looking note + blend meter), not
 * lorem. Answers are a deliberate PARTIAL fill (not every question) so operators
 * can see both the filled and the empty/required-field states.
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
  // Written realistically (still invented) so the reveal note preview quotes a
  // specific, real-sounding answer instead of placeholder text.
  walkIntoRoom:
    "I hang back for the first few minutes and read the room - who's performing, who's actually listening - then I find the one person worth a real conversation and skip the small talk.",
  unplannedFun: '[PREVIEW FIXTURE] Example answer for operator review.',
  meetPeople: '[PREVIEW FIXTURE] Example answer for operator review.',
  workout: '[preview fixture]',
  goodCompany: '[PREVIEW FIXTURE] Example answer for operator review.',
  connectionCreated: '[PREVIEW FIXTURE] Example answer for operator review.',
  // Remaining required fields (dietary, links.*, loyalCommunity, otherTests,
  // nominate) are left unanswered on purpose, so the preview also shows the
  // empty/required-field state exactly as production renders it.
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
 * of scoreApplication or any Anthropic call - the archetype copy (oneLiner and
 * the essence / habitat / peak-edge beats) is real production copy from
 * config/archetypes.ts (that's what operators need to review), the personalNote
 * is written to read exactly like a real generated note (quoting the fixture
 * walkIntoRoom answer), and only the scores + tags are obviously synthetic. A
 * Sage top with a Connector runner-up, weighted so the blend meter reads a clear
 * 75% Sage / 25% Connector (top two normalized within-person).
 */
export const PREVIEW_REVEAL: PreviewReveal = {
  archetype: 'Sage',
  archetypeScores: {
    Sage: 78,
    Connector: 26,
    Host: 20,
    Builder: 16,
    Patron: 12,
    Spark: 10,
  },
  tags: ['preview fixture', 'not a real applicant'],
  personalNote:
    "You told us that when you walk into a room, you \"read the room\" first - who's performing, who's actually listening - before you find the one person worth a real conversation. That's not shyness, it's discernment, and it's the whole reason people end up trusting you with what they don't say out loud. The room feels understood by you, even when it never quite realizes you were the one paying attention.",
  rsvpId: null,
  memberQrCode: 'PREVIEW-FIXTURE-NOT-A-REAL-MEMBER-QR',
};
