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

export function firstAnswerPreview(
  answers: { questionKey: string; answer: string }[],
): string {
  const byKey = Object.fromEntries(answers.map(a => [a.questionKey, a.answer]));
  for (const q of answerQuestions) {
    if (PREVIEW_SKIP.has(q.key)) continue;
    const t = String(byKey[q.key] ?? '').trim();
    if (!t) continue;
    return t.length > 80 ? `${t.slice(0, 77)}…` : t;
  }
  return '';
}

const REFERRER_KEYS = ['referrer2', 'referrer3', 'referrer4'] as const;

export function referrerLines(
  referredBy: string | null | undefined,
  answers: { questionKey: string; answer: string }[],
): string[] {
  const lines: string[] = [];
  if (referredBy?.trim()) lines.push(referredBy.trim());
  const byKey = Object.fromEntries(answers.map(a => [a.questionKey, a.answer]));
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
