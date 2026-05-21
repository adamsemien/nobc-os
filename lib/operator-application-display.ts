import { answerQuestions, APPLY_QUESTIONS } from '@/lib/apply-config';

const LABEL_BY_KEY = Object.fromEntries(APPLY_QUESTIONS.map(q => [q.key, q.label]));

const PREVIEW_SKIP = new Set([
  'referrer2',
  'referrer3',
  'referrer4',
  'consentMembershipRead',
  'consentPhotos',
]);

export function labelForQuestionKey(key: string): string {
  return LABEL_BY_KEY[key] ?? key;
}

// The live /apply form's narrative keys, preferred for the queue preview line.
// Falls back to the apply-config answer questions for older seed/template data.
const PREVIEW_KEYS = [
  'basics.whatYouDo',
  'personality.workingOn',
  'about.whatPeopleComeToYouFor',
  'community.howDoYouKnowGoodCompany',
] as const;

export function firstAnswerPreview(
  answers: { questionKey: string; answer: string }[],
): string {
  const byKey = Object.fromEntries(answers.map(a => [a.questionKey, a.answer]));
  const clip = (t: string) => (t.length > 80 ? `${t.slice(0, 77)}…` : t);
  for (const k of PREVIEW_KEYS) {
    const t = String(byKey[k] ?? '').trim();
    if (t) return clip(t);
  }
  for (const q of answerQuestions) {
    if (PREVIEW_SKIP.has(q.key)) continue;
    const t = String(byKey[q.key] ?? '').trim();
    if (!t) continue;
    return clip(t);
  }
  return '';
}

const REFERRER_KEYS = ['referrer2', 'referrer3', 'referrer4'] as const;

/** Parse the live form's basics.referrers value (a JSON 3-slot array, blanks
 *  included) into clean names. Tolerates a plain non-array string too. */
function parseBasicsReferrers(raw: string | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim());
      }
    } catch {
      /* fall through */
    }
  }
  return trimmed ? [trimmed] : [];
}

export function referrerLines(
  referredBy: string | null | undefined,
  answers: { questionKey: string; answer: string }[],
): string[] {
  const lines: string[] = [];
  if (referredBy?.trim()) lines.push(referredBy.trim());
  const byKey = Object.fromEntries(answers.map(a => [a.questionKey, a.answer]));
  // Live form stores referrers under basics.referrers (JSON array). Earlier
  // generations used the model `referredBy` + the referrer2/3/4 answer slots.
  for (const name of parseBasicsReferrers(byKey['basics.referrers'])) lines.push(name);
  for (const k of REFERRER_KEYS) {
    const t = String(byKey[k] ?? '').trim();
    if (t) lines.push(t);
  }
  return lines;
}

export function referrerCount(
  referredBy: string | null | undefined,
  answers: { questionKey: string; answer: string }[],
): number {
  return referrerLines(referredBy, answers).length;
}

export function formatRelativeSubmitted(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const sec = Math.round(diffMs / 1000);
  if (Math.abs(sec) < 60) return rtf.format(sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 48) return rtf.format(hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 60) return rtf.format(day, 'day');
  const month = Math.round(day / 30);
  return rtf.format(month, 'month');
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDateOnly(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-US', { dateStyle: 'long' });
}
