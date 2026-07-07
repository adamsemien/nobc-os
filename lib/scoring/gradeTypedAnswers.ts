/**
 * AI FIT grader for Apply Scoring v2 (Phase 3).
 *
 * ONE temperature-0 Sonnet call does two INDEPENDENT jobs over the typed scored
 * questions (the 13 free-text questions with a scoringDimension):
 *   1. FIT — memberWorthTotal / aiRecommendation / aiReasoning / tags. This is the
 *      only thing the LOCKED gate branches on. It is assessed on substance and is
 *      NOT told the applicant's nature — the grader never picks or sees an archetype,
 *      so fit cannot be a function of classification.
 *   2. TYPED AWARDS — per question, 0-2 points to at most two archetypes whose
 *      signals the answer genuinely shows. These feed the deterministic tally's
 *      Phase-3 seam (they break genuine tap ties; the floor protects clear tap
 *      winners). Aggregation is UNCAPPED per Adam's 2026-07-07 decision.
 *
 * Classification is NOT done here — the tally in `inRoomTally.ts` decides the nature.
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
});

export type TypedGrade = z.infer<typeof TypedGraderSchema>;

/** Deterministic fit fallback: the tally still classifies; only AI fit is unavailable. */
export const TYPED_GRADE_FALLBACK: TypedGrade = {
  typedGrades: [],
  memberWorthTotal: 50,
  aiRecommendation: 'unclear',
  aiReasoning: 'Automated fit assessment was unavailable for this application.',
  tags: [],
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
  opts: { scoringInstructions?: string | null; applicantName?: string; applicantCity?: string },
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

  return `You are grading a membership application for No Bad Company, a premium curated members club in Austin TX. You do TWO separate jobs. Do not let one leak into the other.

${opts.scoringInstructions ?? 'Reward specificity and substance over polish. A concrete, lived answer beats a smooth, generic one.'}

Applicant: ${opts.applicantName ?? '(name withheld)'}
City: ${opts.applicantCity?.trim() || '(not provided)'}

Typed questions and answers:
${questionBlock || '(no typed questions answered)'}

JOB 1 — FIT (independent of archetype):
Judge how strong a member this person would be, on genuine substance. Do NOT decide or name any archetype/nature here — a separate deterministic step owns that.
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
Award nothing when a question shows no clear signal. Never try to make one archetype "win" — the winner is decided elsewhere. Emit one typedGrades entry per question (use its [stableKey]).`;
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
