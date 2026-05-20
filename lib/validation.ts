import { z } from 'zod';

// Stricter than z.email(): rejects multi-@, missing TLD, embedded whitespace.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((v) => EMAIL_RE.test(v), { message: 'Invalid email' });

// Accepts 10+ digit US/intl phones with common separators; normalises to a
// canonical "+digits" form when storing. Returns null for empty / explicit null.
export const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .refine((v) => /^[\d\s\-().+ ]{10,}$/.test(v), { message: 'Invalid phone' });

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export const optionalEmail = emailSchema.optional().or(z.literal(''));
export const optionalPhone = phoneSchema.optional().or(z.literal(''));

export const shortText = (max = 200) => z.string().trim().max(max);
export const longText = (max = 4000) => z.string().trim().max(max);

export const answerValue = z.union([
  z.string().max(8000),
  z.boolean(),
  z.number().finite(),
  z.null(),
]);

export const answersMap = z.record(z.string().max(120), answerValue);
