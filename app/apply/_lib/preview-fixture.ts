/**
 * Fixture data for the operator-only Apply Preview (`app/apply/preview/page.tsx`,
 * `MembershipForm`'s `previewMode` prop). Every value below is deliberately
 * fake and clearly labeled as such — no real applicant is ever represented
 * here, none of it is sourced from the DB, and none of it is ever sent over
 * the network. Answers are a deliberate PARTIAL fill (not every question) so
 * operators can see both the filled and the empty/required-field states.
 */

export const PREVIEW_ANSWERS: Record<string, string> = {
  firstName: 'Preview',
  lastName: 'Fixture',
  email: 'preview-fixture@example.test',
  cell: '000-000-0000',
  cities: '[preview fixture — example cities]',
  'birthInfo.birthDate': '1990-01-01',
  'birthInfo.birthCity': '[preview fixture]',
  gender: 'Prefer not to say',
  whatYouDo: '[PREVIEW FIXTURE] Example answer for operator review — not a real applicant response.',
  creativePursuits: '[PREVIEW FIXTURE] Example answer for operator review.',
  'referrals.referral1': '[preview fixture]',
  enneagram: '5',
  lastConvinced: '[PREVIEW FIXTURE] Example answer for operator review.',
  obsessedWith: '[PREVIEW FIXTURE] Example answer for operator review.',
  comeToYouFor: '[PREVIEW FIXTURE] Example answer for operator review.',
  expertIn: '[PREVIEW FIXTURE] Example answer for operator review.',
  idealSaturday: '[PREVIEW FIXTURE] Example answer for operator review.',
  workout: '[preview fixture]',
  'recSources.travel': '[preview fixture]',
  'recSources.food': '[preview fixture]',
  'podcasts.podcast1': '[preview fixture]',
  goodCompany: '[PREVIEW FIXTURE] Example answer for operator review.',
  karaoke: '[preview fixture]',
  chapter: '[PREVIEW FIXTURE] Example answer for operator review.',
  investedIn: '[PREVIEW FIXTURE] Example answer for operator review.',
  friendDescribe: '[PREVIEW FIXTURE] Example answer for operator review.',
  // Remaining required fields (homeAddress, dietary, links.*, recommendForPay,
  // loyalBrands, splurgeSave, brandPartner, detailsRight, trustedTaste, the
  // rest of recSources/podcasts, scrollStopping, connectionCreated,
  // loyalCommunity, flowThrough, otherTests, nominate) are left unanswered on
  // purpose, so the preview also shows the empty/required-field state exactly
  // as production renders it. Photos are files, not answers — the picker
  // simply stays empty in preview.
};

/** Shape mirrors `SubmitResult` in MembershipForm.tsx without importing it. */
export interface PreviewReveal {
  archetype: string;
  archetypeScores: Record<string, number>;
  tags: string[];
  personalizedCopy: string;
  rsvpId?: string | null;
  memberQrCode?: string | null;
}

/**
 * Fabricated reveal, computed entirely client-side. This is NEVER the output
 * of scoreApplication/tagApplication or any Anthropic call — the archetype
 * copy (oneLiner/dayStory/nightStory) is real production copy from
 * config/archetypes.ts (that's what operators need to review), but the
 * scores, tags, and personalized copy are hardcoded and unmistakably fake.
 */
export const PREVIEW_REVEAL: PreviewReveal = {
  archetype: 'Connector',
  archetypeScores: {
    Connector: 82,
    Host: 61,
    Curator: 54,
    Builder: 45,
    Maker: 39,
    Patron: 28,
  },
  tags: ['preview fixture', 'not a real applicant'],
  personalizedCopy:
    '[PREVIEW FIXTURE] This reveal text is a hardcoded example for operator review. No AI scoring call was made and no real applicant exists.',
  rsvpId: null,
  memberQrCode: 'PREVIEW-FIXTURE-NOT-A-REAL-MEMBER-QR',
};
