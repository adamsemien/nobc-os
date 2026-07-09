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

/**
 * Fixture In-A-Room options for preview mode. Shape matches `InARoomOption` in
 * MembershipForm.tsx (`{ id, label, order }`). These are invented labels —
 * operators reviewing the preview see representative tap-grid/most-least UI
 * rather than "Loading…". The ids need not match scorer QuestionOption ids;
 * preview never scores.
 */
export const PREVIEW_IN_A_ROOM: Record<string, { id: string; label: string; order: number }[]> = {
  roomPosition: [
    { id: 'rp-1', label: 'At the table, holding court', order: 1 },
    { id: 'rp-2', label: 'Near the drinks, meeting everyone', order: 2 },
    { id: 'rp-3', label: 'On the couch with the one interesting person', order: 3 },
    { id: 'rp-4', label: 'Circling, connecting people to each other', order: 4 },
    { id: 'rp-5', label: 'Outside, getting some air', order: 5 },
    { id: 'rp-6', label: 'In the kitchen, helping', order: 6 },
  ],
  giftMaking: [
    { id: 'gm-1', label: 'People feel seen', order: 1 },
    { id: 'gm-2', label: 'Ideas collide', order: 2 },
    { id: 'gm-3', label: 'Things happen', order: 3 },
    { id: 'gm-4', label: 'Everyone feels welcome', order: 4 },
    { id: 'gm-5', label: 'The vibe lifts', order: 5 },
    { id: 'gm-6', label: 'Decisions get made', order: 6 },
  ],
  partyJudge: [
    { id: 'pj-1', label: 'No good music', order: 1 },
    { id: 'pj-2', label: 'Bad food', order: 2 },
    { id: 'pj-3', label: 'No real conversations', order: 3 },
    { id: 'pj-4', label: 'Wrong crowd', order: 4 },
    { id: 'pj-5', label: 'Hosts not paying attention', order: 5 },
    { id: 'pj-6', label: 'Nothing spontaneous', order: 6 },
  ],
  perfectFriday: [
    { id: 'pf-1', label: 'A long dinner that becomes the only conversation you remember', order: 1 },
    { id: 'pf-2', label: 'A live set somewhere small and loud', order: 2 },
    { id: 'pf-3', label: 'A house party that goes too late', order: 3 },
    { id: 'pf-4', label: 'Drinks with two people who should know each other', order: 4 },
    { id: 'pf-5', label: 'Something outside that turns into an adventure', order: 5 },
    { id: 'pf-6', label: 'A quiet night that stays that way', order: 6 },
  ],
  skipFriday: [
    { id: 'sf-1', label: 'A long dinner that becomes the only conversation you remember', order: 1 },
    { id: 'sf-2', label: 'A live set somewhere small and loud', order: 2 },
    { id: 'sf-3', label: 'A house party that goes too late', order: 3 },
    { id: 'sf-4', label: 'Drinks with two people who should know each other', order: 4 },
    { id: 'sf-5', label: 'Something outside that turns into an adventure', order: 5 },
    { id: 'sf-6', label: 'A quiet night that stays that way', order: 6 },
  ],
  bestSelf: [
    { id: 'bs-1', label: 'The best conversation there', order: 1 },
    { id: 'bs-2', label: 'The connector everyone was waiting for', order: 2 },
    { id: 'bs-3', label: 'The one who made it feel safe to be honest', order: 3 },
    { id: 'bs-4', label: 'The person who kept things moving', order: 4 },
    { id: 'bs-5', label: 'The one who brought everyone together', order: 5 },
    { id: 'bs-6', label: 'The energy the room needed', order: 6 },
  ],
};

/** Shape mirrors `SubmitResult` in MembershipForm.tsx without importing it. */
export interface PreviewReveal {
  archetype: string;
  archetypeScores: Record<string, number>;
  tags: string[];
  personalNote: string;
  // Reveal B (Phase 5): the persisted decisive tally output the reveal reads.
  secondary?: string | null;
  blend?: { primary: number; secondary: number } | null;
  openerPhrase?: string | null;
  habitatThrive?: string | null;
  habitatDim?: string | null;
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
 * Sage top with a Connector runner-up. Reveal B (Phase 5): opens on the member's
 * Q6 phrase (openerPhrase), the blend meter reads the DECISIVE persisted 78/22
 * (never the flattened archetypeScores), and the habitat is templated from the
 * Q4/Q5 picks (habitatThrive/habitatDim).
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
  // Reveal B fields (invented, matching a Sage reveal):
  secondary: 'Connector',
  blend: { primary: 78, secondary: 22 },
  openerPhrase: 'The best conversation there',
  habitatThrive: 'A long dinner that becomes the only conversation you remember',
  habitatDim: 'A loud standing room with thirty first introductions',
  rsvpId: null,
  memberQrCode: 'PREVIEW-FIXTURE-NOT-A-REAL-MEMBER-QR',
};
