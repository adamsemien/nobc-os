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
  { id: 'homeAddress', section: 'who-you-are', label: 'Home Address', type: 'text', required: true },
  {
    id: 'cities',
    section: 'who-you-are',
    label: 'What cities do you split time between or visit regularly?',
    type: 'text',
    required: true,
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
    label: 'What Do You Do',
    type: 'textarea',
    required: true,
    help:
      "Your primary role and industry. What you actually spend most of your time on (it may be different). What you're building or working toward right now.",
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
      { id: 'referral1', label: 'Referral 1', type: 'text', required: true },
      { id: 'referral2', label: 'Referral 2', type: 'text', required: false },
      { id: 'referral3', label: 'Referral 3', type: 'text', required: false },
    ],
  },
  {
    id: 'enneagram',
    section: 'who-you-are',
    label: 'Enneagram Type',
    type: 'number',
    required: false,
    help: "If you don't know yours, skip it - we'll figure it out together.",
  },
  {
    id: 'otherTests',
    section: 'who-you-are',
    label: 'Other Personality Tests',
    type: 'textarea',
    required: false,
    help:
      "Any other personality tests you've taken? List your results below. Myers-Briggs, StrengthsFinder, DISC, Love Languages - whatever you've got. It all helps us put the right people in the room with you.",
  },

  // ---- Section 02 - How You Move Through the World ----
  {
    id: 'lastConvinced',
    section: 'how-you-move',
    label: "What's the last thing you convinced a friend to buy?",
    type: 'textarea',
    required: true,
  },
  {
    id: 'obsessedWith',
    section: 'how-you-move',
    label: "What's something you've become obsessed with lately?",
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
      'Could be advice, recommendations, introductions, certain opportunities, experiences, perspective - or something else entirely.',
  },
  {
    id: 'loyalBrands',
    section: 'how-you-move',
    label: 'What brands are you most loyal to and why?',
    type: 'textarea',
    required: true,
  },
  {
    id: 'expertIn',
    section: 'how-you-move',
    label: 'What would you call yourself a genuine expert in?',
    type: 'textarea',
    required: true,
    help:
      'This may or may not be what people come to you for - and it may or may not be what you do for a living.',
  },
  {
    id: 'splurgeSave',
    section: 'how-you-move',
    label: 'Where do you splurge and where do you save?',
    type: 'textarea',
    required: true,
    help:
      'This helps us understand how you make decisions and match you with brands that actually fit the way you spend.',
  },
  {
    id: 'brandPartner',
    section: 'how-you-move',
    label:
      'If a brand reached out to partner with you tomorrow, which one would actually make sense - and why would it work?',
    type: 'textarea',
    required: true,
    help: 'Think fit, not fantasy.',
  },
  {
    id: 'detailsRight',
    section: 'how-you-move',
    label: "What's a restaurant, hotel, bar, or shop that gets the details right? And why?",
    type: 'textarea',
    required: true,
    help: 'Tell us about it. What did they get right?',
  },
  {
    id: 'idealSaturday',
    section: 'how-you-move',
    label: "What's your ideal Saturday?",
    type: 'textarea',
    required: true,
  },
  { id: 'workout', section: 'how-you-move', label: 'Preferred workout?', type: 'text', required: true },
  {
    id: 'trustedTaste',
    section: 'how-you-move',
    label: 'Whose taste do you trust almost automatically - and what did they do to earn it?',
    type: 'textarea',
    required: true,
    help: 'Could be a friend, celebrity, creator, athlete, or someone in your life.',
  },
  {
    id: 'recSources',
    section: 'how-you-move',
    label: 'Where do you turn for recommendations?',
    type: 'group',
    required: true,
    help: 'Give us a source, person, platform, or community for each.',
    fields: [
      { id: 'travel', label: 'Travel', type: 'text', required: true },
      { id: 'food', label: 'Food', type: 'text', required: true },
      { id: 'healthWellness', label: 'Health & wellness', type: 'text', required: true },
      { id: 'beauty', label: 'Beauty', type: 'text', required: true },
      { id: 'fashionDesign', label: 'Fashion & Design', type: 'text', required: true },
    ],
  },
  {
    id: 'podcasts',
    section: 'how-you-move',
    label: 'Top 2 to 3 podcasts you listen to most',
    type: 'group',
    fields: [
      { id: 'podcast1', label: 'Podcast 1', type: 'text', required: true },
      { id: 'podcast2', label: 'Podcast 2', type: 'text', required: false },
      { id: 'podcast3', label: 'Podcast 3', type: 'text', required: false },
    ],
  },
  {
    id: 'scrollStopping',
    section: 'how-you-move',
    label: 'What kind of content stops you scrolling - and where is it living?',
    type: 'textarea',
    required: true,
    help: 'Platform matters as much as content type here.',
  },
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
    label: "Tell us about a group or community you've stayed loyal to - and what keeps you there.",
    type: 'textarea',
    required: true,
  },
  {
    id: 'karaoke',
    section: 'how-you-move',
    label: "What's your go-to karaoke song?",
    type: 'text',
    required: true,
    help: 'Be honest.',
  },

  // ---- Section 03 - What You're Here For ----
  {
    id: 'chapter',
    section: 'what-youre-here-for',
    label: 'What chapter are you in right now?',
    type: 'textarea',
    required: true,
  },
  {
    id: 'flowThrough',
    section: 'what-youre-here-for',
    label: 'What kind of people, ideas, or opportunities tend to flow through your world?',
    type: 'textarea',
    required: true,
  },
  {
    id: 'investedIn',
    section: 'what-youre-here-for',
    label: "What's something you've invested heavily in recently?",
    type: 'textarea',
    required: true,
    help: 'Time, money, energy, attention - any of the above.',
  },
  {
    id: 'friendDescribe',
    section: 'what-youre-here-for',
    label: 'How would a close friend describe you at a party?',
    type: 'textarea',
    required: true,
  },
  {
    id: 'nominate',
    section: 'what-youre-here-for',
    label: 'Who would you nominate to join No Bad Company?',
    type: 'textarea',
    required: false,
    help: 'Applications are reviewed personally. We will be in touch.',
  },
];

/** Questions belonging to a section, in declared order. */
export function questionsForSection(sectionId: SectionId): Question[] {
  return QUESTIONS.filter((q) => q.section === sectionId);
}
