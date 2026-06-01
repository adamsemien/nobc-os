/**
 * Brand-lift survey — question set + Tier B lift computation.
 *
 * Questions are answered through the public /survey/[token] surface and stored on
 * SurveyResponse.answers (keyed by question key). computeBrandLift reads the submitted PRE/POST
 * responses for an event+sponsor and returns the BrandLiftSummary the recap's Affinity section
 * renders. All numbers are computed here; the model never touches them. Workspace-scoped.
 */
import { db } from '@/lib/db';
import type { BrandLiftSummary } from './recap-types';

export type SurveyQuestionType = 'scale5' | 'yesno' | 'nps' | 'text';

export interface SurveyQuestion {
  key: string;
  prompt: string; // {sponsor} is replaced at render time
  type: SurveyQuestionType;
  required?: boolean;
}

/** Baseline pair, asked at/around registration. */
export const PRE_QUESTIONS: SurveyQuestion[] = [
  { key: 'awareness', prompt: 'Before tonight, how familiar were you with {sponsor}?', type: 'scale5', required: true },
  { key: 'consideration', prompt: 'How likely are you to choose {sponsor} when the need next arises?', type: 'scale5', required: true },
];

/** Post-event set — measures the lift against the baseline plus recall, NPS and a quote. */
export const POST_QUESTIONS: SurveyQuestion[] = [
  { key: 'awareness', prompt: 'After tonight, how familiar are you with {sponsor}?', type: 'scale5', required: true },
  { key: 'consideration', prompt: 'How likely are you now to choose {sponsor}?', type: 'scale5', required: true },
  { key: 'recall', prompt: "Did you recall {sponsor} as a partner of tonight's evening?", type: 'yesno', required: true },
  { key: 'nps', prompt: 'How likely are you to recommend an evening like this to a peer?', type: 'nps', required: true },
  { key: 'conversation_quality', prompt: 'How would you rate the conversations you had tonight?', type: 'scale5' },
  { key: 'quote', prompt: 'In a line — what stayed with you from tonight?', type: 'text' },
];

export function questionsFor(phase: 'PRE' | 'POST'): SurveyQuestion[] {
  return phase === 'PRE' ? PRE_QUESTIONS : POST_QUESTIONS;
}

/** ~50 attendees is the line below which lift reads qualitatively rather than statistically. */
export const SMALL_SAMPLE_THRESHOLD = 50;

function asNum(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function nums(rows: { answers: unknown }[], key: string): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const a = r.answers && typeof r.answers === 'object' ? (r.answers as Record<string, unknown>) : {};
    const n = asNum(a[key]);
    if (n != null) out.push(n);
  }
  return out;
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/** Top-2-box share on a 1–5 scale (answered 4 or 5). */
const top2box = (xs: number[]): number | null => (xs.length ? xs.filter((x) => x >= 4).length / xs.length : null);

export async function computeBrandLift(args: {
  workspaceId: string;
  eventId: string;
  sponsorBrandId: string;
}): Promise<BrandLiftSummary | null> {
  const { workspaceId, eventId, sponsorBrandId } = args;

  const rows = await db.surveyResponse.findMany({
    where: { workspaceId, eventId, sponsorBrandId, submittedAt: { not: null } },
    select: { phase: true, answers: true },
  });
  const post = rows.filter((r) => r.phase === 'POST');
  if (post.length === 0) return null; // no module data → recap keeps "available with module"
  const pre = rows.filter((r) => r.phase === 'PRE');

  // Awareness / consideration lift: post top-box minus pre top-box, in percentage points.
  const liftPP = (key: string): number | null => {
    const preBox = top2box(nums(pre, key));
    const postBox = top2box(nums(post, key));
    if (preBox == null || postBox == null) return null;
    return Math.round((postBox - preBox) * 100);
  };

  // Recall: share answering yes.
  const recallVals = post
    .map((r) => {
      const a = r.answers && typeof r.answers === 'object' ? (r.answers as Record<string, unknown>) : {};
      const v = a.recall;
      return typeof v === 'string' ? v.toLowerCase() : v;
    })
    .filter((v) => v != null);
  const recallYes = recallVals.filter((v) => v === 'yes' || v === true || v === '1' || v === 1).length;
  const sponsorshipRecallPct = recallVals.length ? Math.round((recallYes / recallVals.length) * 100) : null;

  // NPS from 0–10: %promoters(9-10) − %detractors(0-6).
  const npsVals = nums(post, 'nps').filter((n) => n >= 0 && n <= 10);
  let activationNps: number | null = null;
  if (npsVals.length) {
    const promoters = npsVals.filter((n) => n >= 9).length;
    const detractors = npsVals.filter((n) => n <= 6).length;
    activationNps = Math.round(((promoters - detractors) / npsVals.length) * 100);
  }

  // Conversation quality: mean of the 1–5 scale, expressed 0–100.
  const cqMean = avg(nums(post, 'conversation_quality'));
  const conversationQuality = cqMean != null ? Math.round(((cqMean - 1) / 4) * 100) : null;

  // Anonymized quote pull-outs (free text carries no names by construction).
  const quotes = post
    .map((r) => {
      const a = r.answers && typeof r.answers === 'object' ? (r.answers as Record<string, unknown>) : {};
      return typeof a.quote === 'string' ? a.quote.trim() : '';
    })
    .filter((q) => q.length > 0 && q.length <= 220)
    .slice(0, 3);

  return {
    sampleSize: post.length,
    smallSample: post.length < SMALL_SAMPLE_THRESHOLD,
    awarenessLiftPct: liftPP('awareness'),
    considerationLiftPct: liftPP('consideration'),
    sponsorshipRecallPct,
    activationNps,
    conversationQuality,
    quotes,
  };
}
