import { z } from 'zod';

export type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'checkbox' | 'radio';

export type ApplicationSection = {
  key: string;
  label: string;
};

export type ApplicationQuestion = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  rows?: number;
  storage: 'model' | 'answer';
  section: string;
  minLength?: number;
  note?: string;
  options?: string[];
};

export const APPLY_SECTIONS: ApplicationSection[] = [
  { key: 'basics',   label: 'the basics' },
  { key: 'real',     label: 'real questions' },
  { key: 'referral', label: 'who told you about us' },
  { key: 'practical',label: 'the practical part' },
  { key: 'consents', label: 'a few consents' },
];

export const APPLY_QUESTIONS: ApplicationQuestion[] = [
  // basics
  {
    key: 'fullName',
    label: 'full name',
    type: 'text',
    required: true,
    storage: 'model',
    section: 'basics',
  },
  {
    key: 'email',
    label: 'email',
    type: 'email',
    required: true,
    storage: 'model',
    section: 'basics',
  },
  {
    key: 'phone',
    label: 'phone',
    type: 'tel',
    storage: 'model',
    section: 'basics',
  },
  {
    key: 'city',
    label: 'city you call home',
    type: 'text',
    storage: 'model',
    section: 'basics',
  },

  // real questions
  {
    key: 'workingOn',
    label: 'what are you working on right now?',
    type: 'textarea',
    required: true,
    rows: 4,
    storage: 'answer',
    section: 'real',
    minLength: 50,
    note: 'min 50 characters',
  },
  {
    key: 'greatEnergy',
    label: 'who in your life has great energy? tell us about them.',
    type: 'textarea',
    required: true,
    rows: 4,
    storage: 'answer',
    section: 'real',
    minLength: 50,
    note: 'min 50 characters',
  },
  {
    key: 'learnedThisYear',
    label: "what's something you've learned this year that changed how you see things?",
    type: 'textarea',
    required: true,
    rows: 4,
    storage: 'answer',
    section: 'real',
    minLength: 50,
    note: 'min 50 characters',
  },
  {
    key: 'meetPeople',
    label: 'how do you usually meet new people you actually want to know?',
    type: 'textarea',
    required: true,
    rows: 4,
    storage: 'answer',
    section: 'real',
    minLength: 50,
    note: 'min 50 characters',
  },

  // referral
  {
    key: 'referredBy',
    label: 'name of the person who referred you',
    type: 'text',
    storage: 'model',
    section: 'referral',
  },
  {
    key: 'referrer2',
    label: 'two or three more if you have them',
    type: 'text',
    storage: 'answer',
    section: 'referral',
  },
  {
    key: 'referrer3',
    label: 'referrer',
    type: 'text',
    storage: 'answer',
    section: 'referral',
  },
  {
    key: 'referrer4',
    label: 'referrer',
    type: 'text',
    storage: 'answer',
    section: 'referral',
  },

  // practical
  {
    key: 'food',
    label: 'anything we should know about food',
    type: 'textarea',
    rows: 2,
    storage: 'answer',
    section: 'practical',
  },
  {
    key: 'accessibility',
    label: 'anything we should know about accessibility',
    type: 'textarea',
    rows: 2,
    storage: 'answer',
    section: 'practical',
  },
  {
    key: 'priorEvent',
    label: "have you been to one of our events before?",
    type: 'radio',
    options: ['Yes', 'No'],
    storage: 'answer',
    section: 'practical',
  },

  // consents
  {
    key: 'consentEmail',
    label: 'Email me about programming.',
    type: 'checkbox',
    storage: 'model',
    section: 'consents',
  },
  {
    key: 'consentSms',
    label: 'Text me only for urgent event coordination.',
    type: 'checkbox',
    storage: 'model',
    section: 'consents',
  },
  {
    key: 'consentMembershipRead',
    label: 'Someone on the membership team can read what I wrote.',
    type: 'checkbox',
    storage: 'answer',
    section: 'consents',
  },
  {
    key: 'consentPhotos',
    label: 'Photos at events are fine. I can opt out per event when I RSVP.',
    type: 'checkbox',
    storage: 'answer',
    section: 'consents',
  },
];

export const answerQuestions = APPLY_QUESTIONS.filter(q => q.storage === 'answer');

function buildZodShape() {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const q of APPLY_QUESTIONS) {
    if (q.type === 'checkbox') {
      shape[q.key] = z.boolean().default(false);
    } else if (q.type === 'email') {
      shape[q.key] = q.required ? z.string().email() : z.string().email().optional();
    } else if (q.type === 'radio') {
      shape[q.key] = z.string().optional();
    } else if (q.minLength) {
      shape[q.key] = q.required
        ? z.string().min(q.minLength)
        : z.string().min(q.minLength).optional();
    } else {
      shape[q.key] = q.required ? z.string().min(1) : z.string().optional();
    }
  }
  return shape;
}

export const ApplySchema = z.object(buildZodShape());
export type ApplyFormValues = z.infer<typeof ApplySchema>;
