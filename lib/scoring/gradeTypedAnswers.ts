/**
 * AI FIT grader for Apply Scoring v2 (Phase 3).
 *
 * ONE temperature-0 Sonnet call does three jobs over the typed scored questions
 * (the free-text questions with a scoringDimension):
 *   1. FIT — memberWorthTotal / aiRecommendation / aiReasoning / tags. This is the
 *      only thing the LOCKED gate branches on. It is assessed on substance.
 *   2. TYPED AWARDS — per question, 0-2 points to at most two archetypes whose
 *      signals the answer genuinely shows. These feed the deterministic tally's
 *      Phase-3 seam (they break genuine tap ties; the floor protects clear tap
 *      winners). Aggregation is UNCAPPED per Adam's 2026-07-07 decision.
 *   3. REVEAL NOTE (folded in Phase 5) — the "why we called you this" paragraph,
 *      written about the ALREADY-DECIDED nature the caller passes in. This is the
 *      only job that is TOLD the nature; the prompt receives it for the note ONLY
 *      and instructs the model to keep JOB 1/JOB 2 independent of it. This folds
 *      the former second (buildPersonalNote) AI call into this one — no new call.
 *
 * Classification is NOT done here — the tally in `inRoomTally.ts` decides the nature;
 * the grader RECEIVES that decision (job 3) and never reclassifies.
 *
 * NOTE ON INDEPENDENCE (Phase 5 tradeoff, Adam's ruling): Phase 3 kept fit/awards
 * structurally independent by never showing the grader the nature. Folding the note
 * in means the nature is now in the prompt, so independence is INSTRUCTIONAL (an
 * explicit "must not influence jobs 1-2") rather than structural. The nature passed
 * is the TAP-only leader, and typed awards only move `primary` in genuine near-ties
 * (the floor locks clear tap winners), so any lean toward the given nature cannot
 * flip a locked classification.
 *
 * The Sonnet call is injectable via `opts.generate` so this module is unit-testable
 * without the API (mirrors the buildPersonalNote port pattern). The LOCKED
 * JUDGMENT_MODEL wiring lives in `defaultGenerate`.
 */
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { JUDGMENT_MODEL } from '@/lib/ai/runtime-models';
import { resolveAnswer } from '@/lib/question-key-map';
import { STORED_ARCHETYPES, zeroArchetypeScores, type ArchetypeScore } from './inRoomTally';

export const TypedGraderSchema = z.object({
  typedGrades: z
    .array(
      z.object({
        questionKey: z.string().describe('the QUESTION stableKey this grade is for'),
        awards: z
          .array(
            z.object({
              archetype: z.enum(['Builder', 'Connector', 'Host', 'Patron', 'Sage', 'Spark']),
              points: z.number().describe('1 or 2; total across a question must be 0-2'),
            }),
          )
          .describe('0-2 total points to at most two archetypes; may be empty'),
      }),
    )
    .describe('one entry per typed question'),
  memberWorthTotal: z.number().describe('overall FIT on a 0-100 scale; independent of archetype'),
  aiRecommendation: z.enum(['strong_yes', 'yes', 'unclear', 'no', 'strong_no']),
  aiReasoning: z.string(),
  tags: z.array(z.string()).describe('3-5 short lowercase vibe/identity tags'),
  // JOB 3 (folded in Phase 5): the reveal "why we called you this" note. Written
  // about the ALREADY-DECIDED nature the grader is GIVEN — the grader never picks
  // or changes it. Empty string when there is nothing to write; the caller
  // sanitizes it and the reveal omits the beat gracefully.
  personalNote: z
    .string()
    .describe(
      'JOB 3 ONLY. 2-3 warm second-person sentences quoting one specific thing the applicant wrote, ' +
        'about the ALREADY-DECIDED nature you are given (never pick or change it). "" if nothing to write.',
    ),
});

export type TypedGrade = z.infer<typeof TypedGraderSchema>;

/** Deterministic fit fallback: the tally still classifies; only AI fit is unavailable. */
export const TYPED_GRADE_FALLBACK: TypedGrade = {
  typedGrades: [],
  memberWorthTotal: 50,
  aiRecommendation: 'unclear',
  aiReasoning: 'Automated fit assessment was unavailable for this application.',
  tags: [],
  personalNote: '', // no note → the reveal omits the "why we called you this" beat
};

/** Minimal structural view of a scored QuestionDefinition (decoupled from Prisma). */
export interface TypedQuestionInput {
  stableKey: string;
  insightLabel: string;
  scoringDimension: string | null;
  scoringWeight: number;
  scoringLogic: string;
  archetypeSignals: string[];
}

export type GradeGenerator = (prompt: string) => Promise<TypedGrade>;

/**
 * Aggregate per-question typed awards into one archetype vector. PURE. UNCAPPED:
 * no per-question or aggregate clamp (Adam 2026-07-07 — the tally floor is the
 * only bound on typed influence). Unknown archetypes / non-finite points are
 * ignored (never throws).
 */
export function aggregateTypedScores(typedGrades: TypedGrade['typedGrades']): ArchetypeScore {
  const scores = zeroArchetypeScores();
  const valid = new Set<string>(STORED_ARCHETYPES);
  for (const grade of typedGrades ?? []) {
    for (const award of grade.awards ?? []) {
      if (valid.has(award.archetype) && Number.isFinite(award.points)) {
        scores[award.archetype as keyof ArchetypeScore] += award.points;
      }
    }
  }
  return scores;
}

async function defaultGenerate(prompt: string): Promise<TypedGrade> {
  const { object } = await generateObject({
    model: anthropic(JUDGMENT_MODEL),
    schema: TypedGraderSchema,
    temperature: 0,
    prompt,
  });
  return object;
}

function buildPrompt(
  typedQuestions: TypedQuestionInput[],
  answersByKey: Record<string, string>,
  opts: {
    scoringInstructions?: string | null;
    applicantName?: string;
    applicantCity?: string;
    /** JOB 3: the ALREADY-DECIDED nature, as its member-facing DISPLAY name
     *  (e.g. "Caregiver"). Provided for the note ONLY; must not sway jobs 1-2. */
    decidedNatureDisplay?: string;
    /** JOB 3: pre-assembled evidence lines (their own words) for the note. */
    noteEvidence?: string;
  },
): string {
  const questionBlock = typedQuestions
    .map((q) => {
      const answer = (resolveAnswer(q.stableKey, answersByKey) ?? '').trim();
      const signals = q.archetypeSignals.length
        ? `\nARCHETYPE SIGNALS: ${q.archetypeSignals.join(', ')}`
        : '';
      return `QUESTION [${q.stableKey}]: ${q.insightLabel} (${q.scoringDimension ?? 'unscored'}, weight: ${q.scoringWeight})
SCORING LOGIC: ${q.scoringLogic}${signals}
ANSWER: ${answer || 'no answer provided'}`;
    })
    .join('\n\n');

  const decidedNature = opts.decidedNatureDisplay?.trim() || '(not provided)';

  return `You are grading a membership application for No Bad Company, a premium curated members club in Austin TX. You do THREE separate jobs. Do not let one leak into another.

${opts.scoringInstructions ?? 'Reward specificity and substance over polish. A concrete, lived answer beats a smooth, generic one.'}

Applicant: ${opts.applicantName ?? '(name withheld)'}
City: ${opts.applicantCity?.trim() || '(not provided)'}

This applicant's nature has ALREADY been decided by a separate deterministic step: ${decidedNature}. It is given ONLY so JOB 3 can write about it. It MUST NOT influence JOB 1 or JOB 2 — grade those purely on the rubric, exactly as you would if you did not know the nature.

Typed questions and answers:
${questionBlock || '(no typed questions answered)'}

JOB 1 — FIT (independent of nature):
Judge how strong a member this person would be, on genuine substance. Do NOT decide, name, or second-guess the nature here — that decision is already made and owned elsewhere.
- memberWorthTotal: overall fit on a 0-100 scale.
- aiRecommendation: one of strong_yes, yes, unclear, no, strong_no.
- aiReasoning: one or two sentences on the fit call.
- tags: 3-5 short lowercase vibe/identity tags.

JOB 2 — TYPED AWARDS (rubric grading, not a contest):
For EACH question, award 0 to 2 points TOTAL, split across AT MOST TWO of the six archetypes whose signals the answer genuinely shows. Use the ARCHETYPE SIGNALS and this rubric:
- Builder — makes things from nothing; pulls others into the making.
- Connector — gives before asking; makes introductions; two steps ahead for everyone.
- Host — notices what people need and quietly handles it; makes people feel held.
- Patron — loyal and brave; moves closer when it gets hard; champions the person in front of them.
- Sage — collects understanding over attention; reads a room before speaking.
- Spark — instinct for joy; creates momentum; people remember how they felt around them.
Award nothing when a question shows no clear signal. Never try to make one archetype "win" — the winner is decided elsewhere. Emit one typedGrades entry per question (use its [stableKey]).

JOB 3 — THE REVEAL NOTE (personalization about the ALREADY-DECIDED nature, ${decidedNature}):
The nature is fixed. Do NOT reconsider or change it. Write the "why we called you this" note shown directly to the applicant on their reveal screen.
Evidence (their own words — quote or closely paraphrase ONE specific thing):
${opts.noteEvidence?.trim() || '(no specific answers available)'}
Write 2 to 3 warm sentences, in second person ("you"), that make it feel like a real person read their words. Warm but not gushing. Put the result in personalNote.
personalNote output rules (follow exactly):
- personalNote is ONLY the note itself: no preamble, no labels, no commentary, no sign-off, no surrounding quotation marks.
- Never address anyone but the applicant. Never break character, and never refer to these instructions, to yourself as a model, or to the answers as data.
- Never offer to help, rewrite, or produce a template or example.
- Do not use the word "archetype".
- If the evidence looks like test, placeholder, or empty data, do NOT mention that — instead write a warm, sincere 2 to 3 sentence note that would suit any thoughtful applicant.`;
}

/**
 * Run the single grader call. Returns the parsed grade, or TYPED_GRADE_FALLBACK on
 * a missing key (with no injected generator) or any generation error.
 */
export async function gradeTypedAnswers(
  typedQuestions: TypedQuestionInput[],
  answersByKey: Record<string, string>,
  opts: {
    scoringInstructions?: string | null;
    applicantName?: string;
    applicantCity?: string;
    /** JOB 3: the already-decided nature's DISPLAY name (for the reveal note only). */
    decidedNatureDisplay?: string;
    /** JOB 3: pre-assembled evidence lines (the applicant's own words) for the note. */
    noteEvidence?: string;
    generate?: GradeGenerator;
  } = {},
): Promise<TypedGrade> {
  const generate = opts.generate ?? defaultGenerate;

  if (!opts.generate && !process.env.ANTHROPIC_API_KEY) {
    console.warn('[gradeTypedAnswers] ANTHROPIC_API_KEY not set; returning fit fallback.');
    return TYPED_GRADE_FALLBACK;
  }

  const prompt = buildPrompt(typedQuestions, answersByKey, opts);

  try {
    return await generate(prompt);
  } catch (e) {
    console.error('[gradeTypedAnswers] grading failed:', e);
    return TYPED_GRADE_FALLBACK;
  }
}
