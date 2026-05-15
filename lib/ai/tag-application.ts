import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { db } from '@/lib/db';
import { answerQuestions, APPLY_QUESTIONS } from '@/lib/apply-config';
import { referrerLines } from '@/lib/operator-application-display';

const ApplicationTaggingSchema = z.object({
  aiTags: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe('Short lowercase tags: industry, role type, vibe, city, referral, energy, etc.'),
  aiScore: z
    .number()
    .min(0)
    .max(1)
    .describe('Overall fit for a premium curated member club (0–1).'),
  aiRecommendation: z.enum(['strong_yes', 'yes', 'unclear', 'no', 'strong_no']),
  aiReasoning: z
    .string()
    .min(20)
    .describe('2–3 sentences for an operator: score and recommendation rationale.'),
});

const SYSTEM = `You evaluate membership applications for NoBC (No Bad Company), a premium curated member community based in Austin, TX.

Scoring guidance:
- Higher scores (roughly 0.65–1.0): founders, creatives, operators, and connectors with genuine community energy; thoughtful, specific answers; credible referrers or clear social proof; alignment with a serious but warm member club.
- Lower scores (roughly 0.0–0.45): passive consumers, generic or thin answers, little evidence of substance, or weak fit for a curated in-person community.
- Mid scores: mixed signals, incomplete picture, or "unclear" fit.

Tags must be lowercase, concise (1–3 words each), and useful for operator triage (e.g. founder, operator, creative, austin-local, strong-referral, high-energy, thin-answers, no-referral).

Output only structured fields per schema. Be fair and evidence-based from the application text only.`;

export async function tagApplication(applicationId: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[tagApplication] ANTHROPIC_API_KEY is not set; skipping AI tagging.');
    return;
  }

  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: { answers: true },
  });

  if (!app) {
    console.warn(`[tagApplication] Application not found: ${applicationId}`);
    return;
  }

  const labelByKey = Object.fromEntries(APPLY_QUESTIONS.map(q => [q.key, q.label]));
  const byKey = Object.fromEntries(app.answers.map(a => [a.questionKey, a.answer]));

  const qaLines = answerQuestions.map(q => {
    const label = labelByKey[q.key] ?? q.key;
    const text = String(byKey[q.key] ?? '').trim();
    return `${label}\n${text || '(no answer)'}`;
  });

  const referrers = referrerLines(app.referredBy, app.answers);
  const referrersBlock =
    referrers.length > 0 ? referrers.map((r, i) => `${i + 1}. ${r}`).join('\n') : '(none listed)';

  const userPrompt = `Applicant name: ${app.fullName}
City: ${app.city?.trim() || '(not provided)'}

Referrers:
${referrersBlock}

Application answers (Q&A):
${qaLines.join('\n\n')}
`;

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-6'),
    schema: ApplicationTaggingSchema,
    system: SYSTEM,
    prompt: userPrompt,
  });

  const aiTags = object.aiTags.map(t => t.trim().toLowerCase()).filter(Boolean);

  await db.application.update({
    where: { id: applicationId },
    data: {
      aiTags,
      aiScore: object.aiScore,
      aiRecommendation: object.aiRecommendation,
      aiReasoning: object.aiReasoning.trim(),
    },
  });
}
