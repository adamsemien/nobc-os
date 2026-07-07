/** Membership application scoring (Apply Scoring v2 — inverted, Phase 3).
 *
 *  CLASSIFICATION is deterministic: the six In-A-Room tap questions feed the pure
 *  tally in `lib/scoring/inRoomTally.ts`, which decides the nature. FIT stays AI:
 *  one temperature-0 Sonnet call (`gradeTypedAnswers`) judges memberWorthTotal /
 *  aiRecommendation / aiReasoning / tags on the typed questions, independent of the
 *  archetype, and also emits per-question typed awards that break genuine tap ties.
 *
 *  The normalized `archetypeScores` keep the same 0-100-per-archetype scale the
 *  legacy LLM emitted (see `normalizeArchetypeScores`), so `lib/intelligence/worth.ts`
 *  derives the same 0-30 worth and charter/standard/waitlist tiers are unchanged.
 *
 *  SEQUENCING: the tally needs In-A-Room answers, which the Phase-4 input components
 *  collect. Until Phase 4 ships and applicants answer the six, live applications have
 *  no in-room answers and the tally degenerates to its alphabetical fallback — so this
 *  swap is dev-verified only and must NOT be flipped live before Phase 4. */
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  computeInRoomTally,
  zeroArchetypeScores,
  STORED_ARCHETYPES,
  type OptionsById,
  type InRoomAnswers,
  type MostLeastAnswer,
} from '@/lib/scoring/inRoomTally';
import { normalizeArchetypeScores } from '@/lib/scoring/normalizeArchetypeScores';
import {
  gradeTypedAnswers,
  aggregateTypedScores,
  type TypedQuestionInput,
} from '@/lib/scoring/gradeTypedAnswers';

export const ScoringResultSchema = z.object({
  archetype: z.enum(['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark']),
  archetypeScores: z.object({
    Connector: z.number(),
    Host: z.number(),
    Builder: z.number(),
    Patron: z.number(),
    Sage: z.number(),
    Spark: z.number(),
  }),
  memberWorthTotal: z.number(),
  aiRecommendation: z.enum(['strong_yes', 'yes', 'unclear', 'no', 'strong_no']),
  aiReasoning: z.string(),
  tags: z.array(z.string()).describe('3-5 short lowercase vibe/identity tags'),
});

export type ScoringResult = z.infer<typeof ScoringResultSchema>;

/** Catastrophic fallback (unexpected error mid-scoring). The grader owns its own
 *  fit fallback; this only fires if classification itself throws. */
const FALLBACK: ScoringResult = {
  archetype: 'Connector',
  archetypeScores: { Connector: 50, Host: 50, Builder: 50, Patron: 50, Sage: 50, Spark: 50 },
  memberWorthTotal: 50,
  aiRecommendation: 'unclear',
  aiReasoning: 'Automated scoring was unavailable for this application.',
  tags: [],
};

/** Resolve which ApplicationTemplate (and its questions) governs an application. */
async function resolveTemplate(workspaceId: string, templateId: string | null) {
  if (templateId) {
    const t = await db.applicationTemplate.findUnique({
      where: { id: templateId },
      include: { questions: true },
    });
    if (t) return t;
  }
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (ws?.defaultTemplateId) {
    const t = await db.applicationTemplate.findUnique({
      where: { id: ws.defaultTemplateId },
      include: { questions: true },
    });
    if (t) return t;
  }
  return (
    (await db.applicationTemplate.findFirst({
      where: { workspaceId, isDefault: true },
      include: { questions: true },
    })) ??
    (await db.applicationTemplate.findFirst({
      where: { workspaceId },
      include: { questions: true },
    }))
  );
}

type InRoomQuestion = { id: string; stableKey: string; type: string };

/** Parse a stored most_least answer ('{"mostId":"…","leastId":"…"}'). Phase-4 input
 *  contract: tap answers store the QuestionOption id; most_least stores this JSON. */
function parseMostLeast(raw: string): MostLeastAnswer | null {
  try {
    const o = JSON.parse(raw) as { mostId?: unknown; leastId?: unknown };
    if (typeof o.mostId === 'string' && typeof o.leastId === 'string') {
      return { mostId: o.mostId, leastId: o.leastId };
    }
  } catch {
    /* not JSON → treated as unanswered by the tally */
  }
  return null;
}

/** Load the QuestionOption rows for the six In-A-Room questions and shape the
 *  member's answers into the tally's input types. */
async function buildInRoomInputs(
  inRoomQuestions: InRoomQuestion[],
  answersByKey: Record<string, string>,
): Promise<{ optionsById: OptionsById; inRoomAnswers: InRoomAnswers }> {
  if (inRoomQuestions.length === 0) return { optionsById: {}, inRoomAnswers: {} };

  const qById = new Map(inRoomQuestions.map((q) => [q.id, q]));
  const options = await db.questionOption.findMany({
    where: { questionId: { in: inRoomQuestions.map((q) => q.id) } },
    select: { id: true, questionId: true, archetype: true, points: true, openerPhrase: true },
  });

  const optionsById: OptionsById = {};
  for (const o of options) {
    const q = qById.get(o.questionId);
    if (!q) continue;
    optionsById[o.id] = {
      archetype: o.archetype,
      points: o.points,
      openerPhrase: o.openerPhrase,
      stableKey: q.stableKey,
    };
  }

  const inRoomAnswers: InRoomAnswers = {};
  for (const q of inRoomQuestions) {
    const raw = answersByKey[q.stableKey];
    if (!raw) continue;
    inRoomAnswers[q.stableKey] = q.type === 'most_least' ? parseMostLeast(raw) : raw;
  }

  return { optionsById, inRoomAnswers };
}

export async function scoreApplication(applicationId: string): Promise<ScoringResult> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { answers: true },
  });
  if (!application) throw new Error(`Application not found: ${applicationId}`);

  try {
    const template = await resolveTemplate(application.workspaceId, application.templateId);

    const questions = (template?.questions ?? [])
      .filter((q) => q.isActive)
      .sort((a, b) => a.order - b.order);

    const answersByKey: Record<string, string> = {};
    for (const a of application.answers) answersByKey[a.questionKey] = a.answer;

    // (A) Deterministic classification over the six In-A-Room questions.
    const inRoomQuestions: InRoomQuestion[] = questions
      .filter((q) => q.section === 'in-a-room')
      .map((q) => ({ id: q.id, stableKey: q.stableKey, type: q.type }));
    const { optionsById, inRoomAnswers } = await buildInRoomInputs(inRoomQuestions, answersByKey);

    // (B) One temp-0 grader call over the typed scored questions: fit + typed awards.
    const typedQuestions: TypedQuestionInput[] = questions
      .filter((q) => q.scoringDimension)
      .map((q) => ({
        stableKey: q.stableKey,
        insightLabel: q.insightLabel,
        scoringDimension: q.scoringDimension,
        scoringWeight: q.scoringWeight,
        scoringLogic: q.scoringLogic,
        archetypeSignals: q.archetypeSignals,
      }));
    const grade = await gradeTypedAnswers(typedQuestions, answersByKey, {
      scoringInstructions: template?.scoringInstructions ?? null,
      applicantName: application.fullName,
      applicantCity: application.city ?? undefined,
    });
    const typedScores = aggregateTypedScores(grade.typedGrades);

    // (C) Tally with the typed seam; (D) combined = tap + typed.
    const tally = computeInRoomTally(inRoomAnswers, optionsById, typedScores);
    const combined = zeroArchetypeScores();
    for (const arch of STORED_ARCHETYPES) {
      combined[arch] = tally.tapScores[arch] + typedScores[arch];
    }

    // (E) Normalize → 0-100 vector; magnitude from fit, primary pinned to the top slot.
    const archetypeScores = normalizeArchetypeScores(combined, tally.primary, grade.memberWorthTotal);

    return {
      archetype: tally.primary,
      archetypeScores,
      memberWorthTotal: grade.memberWorthTotal,
      aiRecommendation: grade.aiRecommendation,
      aiReasoning: grade.aiReasoning,
      tags: grade.tags,
    };
  } catch (e) {
    console.error('[scoreApplication] scoring failed:', e);
    return FALLBACK;
  }
}
