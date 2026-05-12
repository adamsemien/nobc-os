import { z } from 'zod';

export type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'checkbox';

export type ApplicationQuestion = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  rows?: number;
  layout?: 'half' | 'full';
  // 'model'  → stored as a flat field on Application (key must match Prisma field name)
  // 'answer' → stored as ApplicationAnswer with questionKey = key
  storage: 'model' | 'answer';
};

export const APPLY_QUESTIONS: ApplicationQuestion[] = [
  {
    key: 'firstName',
    label: 'First name',
    type: 'text',
    required: true,
    layout: 'half',
    storage: 'model',
  },
  {
    key: 'lastName',
    label: 'Last name',
    type: 'text',
    required: true,
    layout: 'half',
    storage: 'model',
  },
  {
    key: 'email',
    label: 'Email',
    type: 'email',
    required: true,
    storage: 'model',
  },
  {
    key: 'phone',
    label: 'Phone',
    type: 'tel',
    storage: 'model',
  },
  {
    key: 'city',
    label: 'City',
    type: 'text',
    storage: 'model',
  },
  {
    key: 'referredBy',
    label: 'How did you hear about us?',
    type: 'text',
    storage: 'model',
  },
  {
    key: 'whyJoin',
    label: 'Why do you want to join?',
    type: 'textarea',
    required: true,
    rows: 4,
    storage: 'answer',
  },
  {
    key: 'consentEmail',
    label: 'I agree to receive email updates from No Bad Company.',
    type: 'checkbox',
    storage: 'model',
  },
  {
    key: 'consentSms',
    label: 'I agree to receive SMS updates from No Bad Company.',
    type: 'checkbox',
    storage: 'model',
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
    } else {
      shape[q.key] = q.required ? z.string().min(1) : z.string().optional();
    }
  }
  return shape;
}

export const ApplySchema = z.object(buildZodShape());
export type ApplyFormValues = z.infer<typeof ApplySchema>;
