/** Apply scalar promotion — answers → typed columns (2026-07-16).
 *
 * The account-first apply flow creates the draft with only {fullName, email}
 * (ApplyAccountGate) and every later save is an answers-only PATCH, so the
 * typed contact scalars on Application (phone, city) were never written; the
 * data lived only in ApplicationAnswer rows. This module is THE single
 * answer→scalar mapping: the write path (create/PATCH routes) promotes on
 * every save via `scalarsFromAnswers`, and the read path (submit + approve)
 * self-heals via `promoteApplicationScalars` so a pre-promotion draft never
 * submits or approves with a stale null.
 *
 * Rules:
 *  - ApplicationAnswer rows are NEVER touched — raw answers stay raw.
 *  - Promote-on-parse-only: a value is returned only when it normalizes
 *    cleanly, so a partial autosaved keystroke burst can never clobber a
 *    previously-good scalar. Phone normalizes through toE164 (the opt-in
 *    page's libphonenumber-js normalizer — one library, one output shape).
 *  - ZIP has no Application column (deliberate — no schema change); it is
 *    returned to the caller for the approval-time Person.postalCode carry.
 */
import { db } from '@/lib/db';
import { toE164 } from '@/lib/opt-in/phone';

/** Answer keys this module promotes. `cities` ("other cities you spend real
 *  time in") is intentionally NOT here — home city is `homeAddress.city`. */
const CELL_KEY = 'cell';
const CITY_KEY = 'homeAddress.city';
const ZIP_KEY = 'homeAddress.zip';

const ZIP_RE = /^\d{5}(-\d{4})?$/;

export type PromotableScalars = { phone?: string; city?: string };

/** Pure: map raw apply answers → promotable Application scalar writes.
 *  Returns ONLY keys that normalized cleanly — never a null/garbage value
 *  that would clobber a previously-good scalar. */
export function scalarsFromAnswers(answers: Record<string, unknown>): PromotableScalars {
  const out: PromotableScalars = {};

  const cell = answers[CELL_KEY];
  if (typeof cell === 'string' || typeof cell === 'number') {
    const phone = toE164(String(cell));
    if (phone) out.phone = phone;
  }

  const city = answers[CITY_KEY];
  if (typeof city === 'string') {
    const trimmed = city.trim();
    if (trimmed) out.city = trimmed;
  }

  return out;
}

/** Pure: 5-digit US ZIP from the home-address answer, or null. */
export function zipFromAnswers(answers: Record<string, unknown>): string | null {
  const zip = answers[ZIP_KEY];
  if (typeof zip !== 'string') return null;
  const trimmed = zip.trim();
  return ZIP_RE.test(trimmed) ? trimmed.slice(0, 5) : null;
}

export type PromotedScalars = {
  phone: string | null; // E.164 or null
  city: string | null;
  zip: string | null; // 5-digit; no Application column — for the Person carry
};

/** Effectful: load this application's answers (or use the caller's preloaded
 *  rows), promote parseable scalars onto the Application row, and return the
 *  promoted view. Idempotent; promote-on-parse-only, so it never nulls or
 *  clobbers an existing scalar. Callers own their own error handling —
 *  approval-time enrichment must never fail the approval. */
export async function promoteApplicationScalars(
  applicationId: string,
  preloaded?: Array<{ questionKey: string; answer: string }>,
): Promise<PromotedScalars> {
  const rows =
    preloaded ??
    (await db.applicationAnswer.findMany({
      where: { applicationId, questionKey: { in: [CELL_KEY, CITY_KEY, ZIP_KEY] } },
      orderBy: { createdAt: 'asc' },
      select: { questionKey: true, answer: true },
    }));

  const answers: Record<string, string> = {};
  for (const r of rows) answers[r.questionKey] = r.answer; // newest wins

  const scalars = scalarsFromAnswers(answers);
  const zip = zipFromAnswers(answers);

  // "Flag" for an unparseable required cell: raw stays in ApplicationAnswer for
  // operator eyes; the scalar is left alone. Id only — never log the raw number.
  if (answers[CELL_KEY]?.trim() && !scalars.phone) {
    console.warn(`[promote-answers] unparseable cell answer on application ${applicationId}`);
  }

  if (scalars.phone || scalars.city) {
    await db.application.update({ where: { id: applicationId }, data: scalars });
  }

  return { phone: scalars.phone ?? null, city: scalars.city ?? null, zip };
}
