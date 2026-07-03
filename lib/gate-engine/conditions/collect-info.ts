/** COLLECT_INFO condition (Event Builder Rebuild, Phase B - Decision 2 /
 *  call C2).
 *
 *  Collect-only registration fields: the operator asks, the guest answers,
 *  no judgment is applied. This is deliberately a SEPARATE condition type
 *  from ANSWER_QUESTIONS (the AI-scored application wrap) because tier and
 *  mechanism are stamped per condition contract - collected answers are a
 *  first-party record, never an AI attestation, and pretending otherwise
 *  would break proof honesty.
 *
 *  Answers persist in the proof payload and the commerce bridge copies them
 *  onto RSVP.customAnswers, the field every operator attendee surface
 *  already reads - answers are always operator-visible, never satisfied-
 *  and-vanished (Adam's approval addendum).
 *
 *  Carry-forward: NEVER - registration fields are per-event by nature.
 */
import { z } from "zod";
import type { ConditionTypeDef } from "../types";
import { CONDITION_COLLECT_INFO } from "../types";

const questionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(300),
  type: z.enum(["text", "textarea", "select", "checkbox"]).default("text"),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(200)).max(24).optional(),
});
export type CollectInfoQuestion = z.infer<typeof questionSchema>;

const collectInfoConfigSchema = z.object({
  questions: z.array(questionSchema).min(1).max(24),
});
export type CollectInfoConfig = z.infer<typeof collectInfoConfigSchema>;

const submissionSchema = z.object({
  answers: z.record(
    z.string(),
    z.union([z.string().max(4000), z.boolean(), z.number(), z.null()]),
  ),
});

function isAnswered(value: string | boolean | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return value; // a required checkbox must be checked
  return true;
}

export function createCollectInfoCondition(): ConditionTypeDef<CollectInfoConfig> {
  return {
    type: CONDITION_COLLECT_INFO,
    verificationTier: "FIRST_PARTY",
    proofMechanism: "INTERNAL_RECORD",
    configSchema: collectInfoConfigSchema,
    guestPrompt: (config) =>
      config.questions.length === 1
        ? "Answer one question."
        : "Answer a few questions.",
    isPassive: false,
    carryForward: { kind: "NEVER" },
    async verify({ config, submission }) {
      const parsed = submissionSchema.safeParse(submission);
      if (!parsed.success) {
        return { outcome: "REJECTED", reason: "missing_answers" };
      }
      const submitted = parsed.data.answers;
      // Keep only answers to questions the operator actually asked.
      const answers: Record<string, string | boolean | number | null> = {};
      for (const q of config.questions) {
        if (q.id in submitted) answers[q.id] = submitted[q.id];
      }
      const missing = config.questions.filter(
        (q) => q.required && !isAnswered(answers[q.id]),
      );
      if (missing.length > 0) {
        return { outcome: "REJECTED", reason: "required_unanswered" };
      }
      return {
        outcome: "SATISFIED",
        payload: {
          answers,
          // Labels ride along so the operator surface renders without a
          // config join (and survives later question edits honestly).
          questions: config.questions.map((q) => ({ id: q.id, label: q.label })),
        },
      };
    },
  };
}
