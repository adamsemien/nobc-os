/**
 * Single source of truth for the public membership application's question set.
 *
 * This module is intentionally free of form-rendering concerns. The apply form
 * reads it today; a future voice-interview agent and a DB-backed config editor
 * are both designed to consume this exact shape. Keep it declarative.
 *
 * Answer keys written to ApplicationAnswer:
 *   - simple field  -> question.id            (e.g. "whatYouDo")
 *   - group subfield -> `${question.id}.${subfield.id}` (e.g. "birthInfo.birthDate")
 *
 * `system: true` marks load-bearing fields the submission pipeline depends on:
 *   email  -> creates the Member, dedupes, sends the acceptance email
 *   cell   -> identity / phone of record
 *   first name -> identity
 *   date of birth -> Human Design + astrology + archetype scoring
 * There is no firewall logic here yet; the marker only reserves the seam.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'date'
  | 'time'
  | 'select'
  | 'url'
  | 'number'
  | 'group'
  | 'photo';

export interface SubField {
  id: string;
  /** Optional visible label for the sub-field. */
  label?: string;
  /** Sub-fields are never themselves groups or photo pickers. */
  type: Exclude<FieldType, 'group' | 'photo'>;
  required?: boolean;
  system?: boolean;
  placeholder?: string;
  /** For `select` sub-fields (e.g. the home-address state dropdown). */
  options?: string[];
  /** Layout hint: sub-fields sharing a `row` render side by side on one line.
   *  When ANY sub-field in a group carries a row, the group is laid out row by
   *  row (a sub-field with no row gets its own full-width line). Groups with no
   *  row hints keep the default responsive two-column grid. */
  row?: string;
}

export interface Question {
  /** Stable id; also the ApplicationAnswer key (or key prefix for groups). */
  id: string;
  section: SectionId;
  /** Exact question text. */
  label: string;
  type: FieldType;
  required?: boolean;
  /** Exact helper text. */
  help?: string;
  /** For `select`. */
  options?: string[];
  /** For `group`. */
  fields?: SubField[];
  /** Load-bearing field marker (see file header). No logic attached yet. */
  system?: boolean;
  /** Layout hint only: questions sharing a `row` may pair onto one line. */
  row?: string;
  /** This field may legitimately be answered "none". */
  allowNone?: boolean;
}

export type SectionId = 'who-you-are' | 'how-you-move' | 'what-youre-here-for';

export interface Section {
  id: SectionId;
  /** 1-based section number. */
  index: number;
  /** Section intro title. */
  title: string;
  /** Section eyebrow, e.g. "SECTION 01". */
  eyebrow: string;
}

export const SECTIONS: Section[] = [
  { id: 'who-you-are', index: 1, title: 'Who You Are', eyebrow: 'SECTION 01' },
  {
    id: 'how-you-move',
    index: 2,
    title: 'How You Move Through the World',
    eyebrow: 'SECTION 02',
  },
  { id: 'what-youre-here-for', index: 3, title: "What You're Here For", eyebrow: 'SECTION 03' },
];

/** Editorial intro copy rendered above Section 01. */
export const INTRO = {
  lead:
    'No Bad Company exists because the right introduction at the right moment changes everything. This application is how we make that happen with intention.',
  body: [
    'Answer as specifically as you can. Not the polished version - the real one. The more honestly you show up here, the more precisely we can curate who walks into the same room as you.',
    "Sometimes you'll know exactly who you need to meet. Sometimes you won't - and that's where we come in.",
  ],
  bold: 'We read every application. Nothing goes unnoticed.',
};

/** US states + District of Columbia, full names, for the home-address select. */
export const US_STATES: string[] = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

const ENNEAGRAM_OPTIONS: string[] = [
  '1 - The Reformer',
  '2 - The Helper',
  '3 - The Achiever',
  '4 - The Individualist',
  '5 - The Investigator',
  '6 - The Loyalist',
  '7 - The Enthusiast',
  '8 - The Challenger',
  '9 - The Peacemaker',
  "I don't know",
];

const MBTI_OPTIONS: string[] = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
  "I don't know",
];

const LOVE_LANGUAGE_OPTIONS: string[] = [
  'Words of Affirmation',
  'Quality Time',
  'Physical Touch',
  'Acts of Service',
  'Receiving Gifts',
  "I don't know",
];

export const QUESTIONS: Question[] = [
  // ---- Section 01 - Who You Are ----
  { id: 'firstName', section: 'who-you-are', label: 'First Name', type: 'text', required: true, system: true, row: 'name' },
  { id: 'lastName', section: 'who-you-are', label: 'Last Name', type: 'text', required: true, row: 'name' },
  {
    id: 'email',
    section: 'who-you-are',
    label: 'Email (the one you actually check)',
    type: 'email',
    required: true,
    system: true,
    row: 'contact',
  },
  { id: 'cell', section: 'who-you-are', label: 'Cell', type: 'tel', required: true, system: true, row: 'contact' },
  {
    id: 'homeAddress',
    section: 'who-you-are',
    label: 'Home Address',
    type: 'group',
    fields: [
      // Row 1: street on its own line. Row 2: city + state + zip across.
      { id: 'street', label: 'Street Address', type: 'text', required: true, row: 'addr1' },
      { id: 'city', label: 'City', type: 'text', required: true, row: 'addr2' },
      { id: 'state', label: 'State', type: 'select', required: true, options: US_STATES, row: 'addr2' },
      { id: 'zip', label: 'ZIP', type: 'text', required: true, row: 'addr2' },
    ],
  },
  {
    id: 'cities',
    section: 'who-you-are',
    label: 'What other cities do you spend real time in?',
    type: 'text',
    required: true,
    help: 'Outside Austin - places you visit often, have people in, or feel part of.',
  },
  {
    id: 'birthInfo',
    section: 'who-you-are',
    label: 'Date of Birth, City, and Time of Birth',
    type: 'group',
    help:
      "We use this to generate your Human Design chart and astrological profile - two of the ways we understand how you're wired and who you belong in a room with.",
    fields: [
      { id: 'birthDate', label: 'Date of Birth', type: 'date', required: true, system: true },
      { id: 'birthCity', label: 'City of Birth', type: 'text', required: true },
      // birthTime kept optional: exact birth time is often unknown and hard
      // validation here would block otherwise-complete applications.
      { id: 'birthTime', label: 'Time of Birth', type: 'time', required: false },
    ],
  },
  {
    id: 'gender',
    section: 'who-you-are',
    label: 'Gender',
    type: 'select',
    required: true,
    options: ['Female', 'Male', 'Prefer not to say'],
  },
  {
    id: 'dietary',
    section: 'who-you-are',
    label: 'Food Allergies or Dietary Restrictions',
    type: 'text',
    required: true,
    allowNone: true,
  },
  {
    id: 'links',
    section: 'who-you-are',
    label: 'Links that tell us about you',
    type: 'group',
    fields: [
      { id: 'website', label: 'Website', type: 'url', required: false },
      { id: 'linkedin', label: 'LinkedIn', type: 'url', required: false },
      { id: 'instagram', label: 'Instagram', type: 'url', required: false },
      { id: 'other', label: 'Other', type: 'url', required: false },
    ],
  },
  // A `photo` question writes no answer key of its own: the form's picker holds
  // the files and the submit pipeline persists the uploaded R2 keys as the
  // existing `photos.urls` answer (see MembershipForm handleSubmit). Placed as
  // the close of the identity block - the natural end of "tell us who you are".
  {
    id: 'photos',
    section: 'who-you-are',
    label: 'Photos of you',
    type: 'photo',
    required: true,
    help:
      'Share 1 to 5 recent photos that feel like you - at least one clear shot of your face, so we can put a face to the name at the door.',
  },
  {
    id: 'whatYouDo',
    section: 'who-you-are',
    label: 'What do you do?',
    type: 'textarea',
    required: true,
    help: 'Your primary role, industry, and company.',
  },
  {
    id: 'characteristicsGoodAtJob',
    section: 'who-you-are',
    label: 'What characteristics make you good at your job?',
    type: 'textarea',
    required: true,
  },
  {
    id: 'creativePursuits',
    section: 'who-you-are',
    label: 'Creative Pursuits and Passion Projects',
    type: 'textarea',
    required: true,
    help: 'What are you building, making, or exploring outside of work?',
  },
  {
    id: 'referrals',
    section: 'who-you-are',
    label: 'Who referred you?',
    type: 'group',
    help: 'Up to three names.',
    fields: [
      { id: 'referral1First', label: 'Referral 1 - First Name', type: 'text', required: true },
      { id: 'referral1Last', label: 'Referral 1 - Last Name', type: 'text', required: true },
      { id: 'referral2First', label: 'Referral 2 - First Name', type: 'text', required: false },
      { id: 'referral2Last', label: 'Referral 2 - Last Name', type: 'text', required: false },
      { id: 'referral3First', label: 'Referral 3 - First Name', type: 'text', required: false },
      { id: 'referral3Last', label: 'Referral 3 - Last Name', type: 'text', required: false },
    ],
  },
  {
    id: 'enneagram',
    section: 'who-you-are',
    label: 'Enneagram Type',
    type: 'select',
    required: false,
    options: ENNEAGRAM_OPTIONS,
  },
  {
    id: 'mbti',
    section: 'who-you-are',
    label: 'Myers-Briggs Type',
    type: 'select',
    required: false,
    options: MBTI_OPTIONS,
  },
  {
    id: 'loveLanguage',
    section: 'who-you-are',
    label: "What's your love language?",
    type: 'select',
    required: false,
    options: LOVE_LANGUAGE_OPTIONS,
  },
  {
    id: 'otherTests',
    section: 'who-you-are',
    label: 'Other Personality Tests',
    type: 'textarea',
    required: false,
    help: "Anything else: StrengthsFinder, DISC, Human Design, whatever you've got.",
  },

  // ---- Section 02 - How You Move Through the World ----
  {
    id: 'obsessedWith',
    section: 'how-you-move',
    label: "What's something you've become obsessed with?",
    type: 'textarea',
    required: true,
  },
  {
    id: 'recommendForPay',
    section: 'how-you-move',
    label: "What do you recommend to everyone like you're getting paid for it?",
    type: 'textarea',
    required: true,
  },
  {
    id: 'comeToYouFor',
    section: 'how-you-move',
    label: 'What do people consistently come to you for?',
    type: 'textarea',
    required: true,
    help:
      'A good tax guy, a margarita recipe, cooking advice - whatever people keep coming back to you for.',
  },
  {
    id: 'walkIntoRoom',
    section: 'how-you-move',
    label: "You walk into a room where you don't know anyone. What do you actually do?",
    type: 'textarea',
    required: true,
    help:
      'This is how we make the room comfortable for you. Do you find someone to talk to, or hang back and read the room first?',
  },
  {
    id: 'unplannedFun',
    section: 'how-you-move',
    label: "What's the most fun you've had recently that wasn't planned?",
    type: 'textarea',
    required: true,
    help:
      'A day or a night that started as nothing and turned into a story. Maybe you went to the park and ended up in a pickup game with strangers who are now your Sunday soccer crew. What happened?',
  },
  {
    id: 'meetPeople',
    section: 'how-you-move',
    label: 'Where do you meet new people?',
    type: 'textarea',
    required: true,
    help:
      "Is it a bar, the gym, a friend's house? A hobby, a class? Wherever the good ones actually come from.",
  },
  { id: 'workout', section: 'how-you-move', label: 'Preferred workout?', type: 'text', required: true },
  {
    id: 'goodCompany',
    section: 'how-you-move',
    label: "How do you know when you're in good company?",
    type: 'textarea',
    required: true,
  },
  {
    id: 'connectionCreated',
    section: 'how-you-move',
    label: 'Tell us about a connection or opportunity you helped create for someone else.',
    type: 'textarea',
    required: true,
  },
  {
    id: 'loyalCommunity',
    section: 'how-you-move',
    label: "Tell us about a group or community you've stayed loyal to - and what keeps you there?",
    type: 'textarea',
    required: true,
  },

  // ---- Section 03 - What You're Here For ----
  {
    id: 'nominate',
    section: 'what-youre-here-for',
    label: "Who's someone you think we should meet?",
    type: 'textarea',
    required: false,
    help: 'Applications are reviewed personally. We will be in touch.',
  },
];

/** Questions belonging to a section, in declared order. */
export function questionsForSection(sectionId: SectionId): Question[] {
  return QUESTIONS.filter((q) => q.section === sectionId);
}
