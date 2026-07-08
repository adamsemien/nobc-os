/** Membership application scoring (Apply Scoring v2 — inverted, Phase 3; Reveal B, Phase 5).
 *
 *  CLASSIFICATION is deterministic: the six In-A-Room tap questions feed the pure
 *  tally in `lib/scoring/inRoomTally.ts`, which decides the nature. FIT stays AI:
 *  one temperature-0 Sonnet call (`gradeTypedAnswers`) judges memberWorthTotal /
 *  aiRecommendation / aiReasoning / tags on the typed questions, emits per-question
 *  typed awards that break genuine tap ties, AND (Phase 5) writes the reveal note
 *  about the already-decided nature it is given — folding the former second AI call
 *  in, so scoring is still ONE model call. See gradeTypedAnswers for the independence
 *  note (the nature is passed for the note only).
 *
 *  REVEAL B (Phase 5): scoreApplication also returns + the submit route persists the
 *  decisive tally output the reveal reads verbatim — secondary, the decisive `blend`
 *  (from raw combined points, NOT the normalized vector), the Q6 openerPhrase, the
 *  templated Q4/Q5 habitat labels, and the folded personalNote.
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
// Read-only references (frozen modules): the display-name map and the shared
// note-evidence assembler + meta-commentary guard. Phase 5 folds the reveal note
// into the grader, so the note evidence is assembled here and passed in.
import { archetypeDisplayName } from '@/config/archetypes';
import { assembleNoteEvidence, sanitizeNote } from '@/lib/applications/personal-note';

// B2/B3: the top two natures count as a "close blend" when their decisive tally
// percentages are within this many points. Single source of truth for both the
// blend-aware reveal note (grader JOB 3) and the blend subline (JOB 4).
const BLEND_CLOSE_THRESHOLD = 15;

/** B7: normalize em/en dashes to spaced hyphens in member-facing AI text — a
 *  belt-and-suspenders pass alongside the grader prompt constraint (models still
 *  emit dashes). Member copy law is spaced hyphens, never em dashes. */
function toSpacedHyphens(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ' - ');
}

const STORED_ARCHETYPE_ENUM = z.enum(['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark']);

export const ScoringResultSchema = z.object({
  archetype: STORED_ARCHETYPE_ENUM,
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
  // ── Reveal B (Phase 5): the persisted tally output the reveal reads verbatim. ──
  // `archetype` above is the primary nature; these are the rest of the decision.
  secondary: STORED_ARCHETYPE_ENUM,
  /** DECISIVE blend from raw combined tally points (NOT the normalized vector). */
  blend: z.object({ primary: z.number(), secondary: z.number() }),
  /** Q6 (bestSelf) openerPhrase — opens the reveal, never contradicted. */
  openerPhrase: z.string().nullable(),
  /** Q4 (perfectFriday) picked option label — "your best rooms". */
  habitatThrive: z.string().nullable(),
  /** Q5 (skipFriday) picked option label — "rooms that don't deserve you". */
  habitatDim: z.string().nullable(),
  /** Folded reveal note (grader JOB 3), sanitized; null → reveal omits the beat. */
  personalNote: z.string().nullable(),
  /** B2 blend subline (grader JOB 4), shown beneath the reveal hero. Non-empty only
   *  when the top two natures are within BLEND_CLOSE_THRESHOLD; null/"" → omitted.
   *  Additive + NOT persisted — present on the fresh post-submit reveal only. */
  subline: z.string().nullable(),
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
  secondary: 'Sage',
  blend: { primary: 50, secondary: 50 },
  openerPhrase: null,
  habitatThrive: null,
  habitatDim: null,
  personalNote: null,
  subline: null,
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
): Promise<{
  optionsById: OptionsById;
  inRoomAnswers: InRoomAnswers;
  /** id → member-facing option LABEL. Used to build the templated habitat copy
   *  from the picked Q4/Q5 options (Reveal B, Phase 5). */
  labelsById: Record<string, string>;
}> {
  if (inRoomQuestions.length === 0) return { optionsById: {}, inRoomAnswers: {}, labelsById: {} };

  const qById = new Map(inRoomQuestions.map((q) => [q.id, q]));
  const options = await db.questionOption.findMany({
    where: { questionId: { in: inRoomQuestions.map((q) => q.id) } },
    select: { id: true, questionId: true, archetype: true, points: true, openerPhrase: true, label: true },
  });

  const optionsById: OptionsById = {};
  const labelsById: Record<string, string> = {};
  for (const o of options) {
    const q = qById.get(o.questionId);
    if (!q) continue;
    optionsById[o.id] = {
      archetype: o.archetype,
      points: o.points,
      openerPhrase: o.openerPhrase,
      stableKey: q.stableKey,
    };
    labelsById[o.id] = o.label;
  }

  const inRoomAnswers: InRoomAnswers = {};
  for (const q of inRoomQuestions) {
    const raw = answersByKey[q.stableKey];
    if (!raw) continue;
    inRoomAnswers[q.stableKey] = q.type === 'most_least' ? parseMostLeast(raw) : raw;
  }

  return { optionsById, inRoomAnswers, labelsById };
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

    // (A) Load the six In-A-Room questions + their options (+ labels for habitat).
    const inRoomQuestions: InRoomQuestion[] = questions
      .filter((q) => q.section === 'in-a-room')
      .map((q) => ({ id: q.id, stableKey: q.stableKey, type: q.type }));
    const { optionsById, inRoomAnswers, labelsById } = await buildInRoomInputs(
      inRoomQuestions,
      answersByKey,
    );

    // (B) TAP-ONLY tally FIRST → the deterministic nature the grader writes the reveal
    // note about. Typed grades are NOT consulted here; per §3.3 they can only move the
    // primary in a genuine near-tie (the floor locks clear tap winners), so the note's
    // nature equals the FINAL primary in every floor-locked case.
    const tapTally = computeInRoomTally(inRoomAnswers, optionsById);
    const decidedNature = tapTally.primary;
    // B2/B3: is the top-two blend close enough to earn a blend-aware note + subline?
    // Read from the TAP tally (grader-time; the note + subline are written about the
    // tap-decided nature — the Phase-5 invariant), against the single threshold.
    const blendClose = tapTally.blend.primary - tapTally.blend.secondary <= BLEND_CLOSE_THRESHOLD;

    // (C) ONE temp-0 grader call: FIT + typed awards + the FOLDED reveal note about the
    // already-decided nature. The nature enters the prompt for the note (JOB 3) only.
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
      decidedNatureDisplay: archetypeDisplayName(decidedNature),
      secondaryDisplay: archetypeDisplayName(tapTally.secondary),
      blendClose,
      noteEvidence: assembleNoteEvidence(decidedNature, answersByKey),
    });
    const typedScores = aggregateTypedScores(grade.typedGrades);
    // Guard the folded note as the standalone writer did: strip model meta-commentary,
    // empty → the reveal omits the "why we called you this" beat gracefully. B7:
    // normalize any em dashes the model still emits to spaced hyphens.
    const sanitizedNote = sanitizeNote(grade.personalNote ?? '');
    const personalNote = sanitizedNote ? toSpacedHyphens(sanitizedNote) : sanitizedNote;
    // B2: the blend subline. Belt-and-suspenders — force '' unless the blend is close
    // (even if the model emitted one anyway), strip any wrapping quotes, normalize dashes.
    const subline = blendClose
      ? toSpacedHyphens((grade.subline ?? '').trim().replace(/^["']+|["']+$/g, ''))
      : '';

    // (D) FINAL tally with the typed seam; (E) combined = tap + typed.
    const tally = computeInRoomTally(inRoomAnswers, optionsById, typedScores);
    const combined = zeroArchetypeScores();
    for (const arch of STORED_ARCHETYPES) {
      combined[arch] = tally.tapScores[arch] + typedScores[arch];
    }

    // (F) Normalize → 0-100 vector for operator/worth surfaces + the reveal spectrum.
    // The reveal BLEND does NOT read this vector (it flattens the top two toward
    // ~55/45); it reads the DECISIVE tally.blend persisted below.
    const archetypeScores = normalizeArchetypeScores(combined, tally.primary, grade.memberWorthTotal);

    // (G) Templated habitat from the member's LITERAL Q4 (perfectFriday) / Q5
    // (skipFriday) picks — tap answer is the picked option id → its member-facing label.
    const q4Id = inRoomAnswers['perfectFriday'];
    const q5Id = inRoomAnswers['skipFriday'];
    const habitatThrive = typeof q4Id === 'string' ? labelsById[q4Id] ?? null : null;
    const habitatDim = typeof q5Id === 'string' ? labelsById[q5Id] ?? null : null;

    return {
      archetype: tally.primary,
      archetypeScores,
      memberWorthTotal: grade.memberWorthTotal,
      aiRecommendation: grade.aiRecommendation,
      aiReasoning: grade.aiReasoning,
      tags: grade.tags,
      secondary: tally.secondary,
      blend: tally.blend,
      openerPhrase: tally.openerPhrase,
      habitatThrive,
      habitatDim,
      personalNote,
      subline,
    };
  } catch (e) {
    console.error('[scoreApplication] scoring failed:', e);
    return FALLBACK;
  }
}
