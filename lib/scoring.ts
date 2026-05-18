/** Question-agnostic AI scoring for membership applications.
 *
 *  The scoring prompt references no hardcoded question names. It loads the
 *  active QuestionDefinitions for the application's ApplicationTemplate and
 *  scores each answer against that question's own scoringLogic and weight.
 *  Adding a question automatically includes it; removing or renaming one
 *  never breaks scoring. */
import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { db } from '@/lib/db';
import { resolveAnswer } from '@/lib/question-key-map';

const SCORING_MODEL = 'claude-sonnet-4-20250514';

export const ScoringResultSchema = z.object({
  archetype: z.enum(['Connector', 'Host', 'Curator', 'Builder', 'Maker', 'Patron']),
  archetypeScores: z.object({
    Connector: z.number(),
    Host: z.number(),
    Curator: z.number(),
    Builder: z.number(),
    Maker: z.number(),
    Patron: z.number(),
  }),
  dimensionScores: z.object({
    influence: z.number(),
    contribution: z.number(),
    activation: z.number(),
    taste: z.number(),
  }),
  memberWorthTotal: z.number(),
  aiRecommendation: z.enum(['strong_yes', 'yes', 'unclear', 'no', 'strong_no']),
  aiReasoning: z.string(),
  tags: z.array(z.string()).describe('3-5 short lowercase vibe/identity tags'),
});

export type ScoringResult = z.infer<typeof ScoringResultSchema>;

const FALLBACK: ScoringResult = {
  archetype: 'Connector',
  archetypeScores: { Connector: 50, Host: 50, Curator: 50, Builder: 50, Maker: 50, Patron: 50 },
  dimensionScores: { influence: 5, contribution: 5, activation: 5, taste: 5 },
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

export async function scoreApplication(applicationId: string): Promise<ScoringResult> {
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: { answers: true },
  });
  if (!application) throw new Error(`Application not found: ${applicationId}`);

  const template = await resolveTemplate(application.workspaceId, application.templateId);

  const questions = (template?.questions ?? [])
    .filter((q) => q.isActive)
    .sort((a, b) => a.order - b.order);

  const answersByKey: Record<string, string> = {};
  for (const a of application.answers) answersByKey[a.questionKey] = a.answer;

  const scored = questions.filter((q) => q.scoringDimension);

  const questionBlock = scored
    .map((q) => {
      const answer = (resolveAnswer(q.stableKey, answersByKey) ?? '').trim();
      const signals = q.archetypeSignals.length
        ? `\nARCHETYPE SIGNALS: ${q.archetypeSignals.join(', ')}`
        : '';
      return `QUESTION: ${q.insightLabel} (${q.scoringDimension}, weight: ${q.scoringWeight})
SCORING LOGIC: ${q.scoringLogic}${signals}
ANSWER: ${answer || 'no answer provided'}`;
    })
    .join('\n\n');

  const prompt = `You are scoring a membership application for No Bad Company, a premium curated members club in Austin TX.

${template?.scoringInstructions ?? 'Score the applicant on genuine fit. Reward specificity and substance over polish.'}

Applicant: ${application.fullName}
City: ${application.city?.trim() || '(not provided)'}

Questions and answers:
${questionBlock || '(no scored questions answered)'}

Score each dimension (influence, contribution, activation, taste) on a scale of 1-10.
Weight each question's contribution by its stated weight (0 = ignore, 1 = primary).
archetypeScores are 0-100 per archetype. Assign the top archetype from: Connector, Host, Curator, Builder, Maker, Patron.
Use the ARCHETYPE SIGNALS on each question to weight your archetype decision.
memberWorthTotal is overall fit on a 0-100 scale.
Also produce 3-5 short lowercase tags capturing this person's vibe/identity.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[scoreApplication] ANTHROPIC_API_KEY not set; returning fallback score.');
    return FALLBACK;
  }

  try {
    const { object } = await generateObject({
      model: anthropic(SCORING_MODEL),
      schema: ScoringResultSchema,
      prompt,
    });
    return object;
  } catch (e) {
    console.error('[scoreApplication] scoring failed:', e);
    return FALLBACK;
  }
}
