/** ANSWER_QUESTIONS condition (Tier 3 / AI_SCORING - AI-attested).
 *
 *  Wraps the FROZEN scorer `scoreApplication()` from lib/scoring.ts as its
 *  verifier - it calls it, never edits it, and never touches MembershipForm
 *  internals. The application flow persists the Application row; this
 *  condition verifies the scored result: needsHuman (aiRecommendation
 *  "unclear") -> PENDING_REVIEW; a positive recommendation ("yes" /
 *  "strong_yes") that clears config.minScore -> SATISFIED; otherwise
 *  REJECTED. Proof payload: { score, archetype, needsHuman }.
 *
 *  Carry-forward: 12 months from original verification, then re-ask
 *  (§16.4 LOCKED).
 */
import { z } from "zod";
import type { ScoringResult } from "@/lib/scoring";
import type { ConditionTypeDef } from "../types";
import { CONDITION_ANSWER_QUESTIONS } from "../types";

const answerQuestionsConfigSchema = z.object({
  /** Minimum memberWorthTotal (0-100). Absent = recommendation alone decides. */
  minScore: z.number().min(0).max(100).optional(),
  /** Pin verification to a specific application template. */
  templateId: z.string().optional(),
});
export type AnswerQuestionsConfig = z.infer<typeof answerQuestionsConfigSchema>;

const answerQuestionsSubmissionSchema = z.object({
  applicationId: z.string().min(1),
});

export type ApplicationSnapshot = {
  id: string;
  workspaceId: string;
  memberId: string | null;
  email: string;
  templateId: string | null;
};

export type ApplicationLoader = (
  applicationId: string
) => Promise<ApplicationSnapshot | null>;

export type ApplicationScorer = (applicationId: string) => Promise<ScoringResult>;

async function defaultLoadApplication(
  applicationId: string
): Promise<ApplicationSnapshot | null> {
  const { db } = await import("@/lib/db");
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: { id: true, workspaceId: true, memberId: true, email: true, templateId: true },
  });
  return app;
}

async function defaultScore(applicationId: string): Promise<ScoringResult> {
  const { scoreApplication } = await import("@/lib/scoring");
  return scoreApplication(applicationId);
}

const POSITIVE_RECOMMENDATIONS: ReadonlySet<string> = new Set(["strong_yes", "yes"]);

export function createAnswerQuestionsCondition(ports?: {
  loadApplication?: ApplicationLoader;
  score?: ApplicationScorer;
}): ConditionTypeDef<AnswerQuestionsConfig> {
  const loadApplication = ports?.loadApplication ?? defaultLoadApplication;
  const score = ports?.score ?? defaultScore;

  return {
    type: CONDITION_ANSWER_QUESTIONS,
    verificationTier: "AI_ATTESTED",
    proofMechanism: "AI_SCORING",
    configSchema: answerQuestionsConfigSchema,
    guestPrompt: () => "Apply to attend - answer a few questions.",
    isPassive: false,
    carryForward: { kind: "MONTHS", months: 12 },
    async verify({ config, submission, member, workspaceId }) {
      const parsed = answerQuestionsSubmissionSchema.safeParse(submission);
      if (!parsed.success) {
        return { outcome: "REJECTED", reason: "missing_application" };
      }
      const app = await loadApplication(parsed.data.applicationId);
      if (!app) {
        return { outcome: "REJECTED", reason: "application_not_found" };
      }
      if (app.workspaceId !== workspaceId) {
        return { outcome: "REJECTED", reason: "application_workspace_mismatch" };
      }
      const owned =
        app.memberId === member.id ||
        app.email.toLowerCase() === member.email.toLowerCase();
      if (!owned) {
        return { outcome: "REJECTED", reason: "application_not_owned_by_member" };
      }
      if (config.templateId && app.templateId !== config.templateId) {
        return { outcome: "REJECTED", reason: "application_template_mismatch" };
      }

      const result = await score(app.id);
      const needsHuman = result.aiRecommendation === "unclear";
      const payload = {
        score: result.memberWorthTotal,
        archetype: result.archetype,
        needsHuman,
        aiRecommendation: result.aiRecommendation,
        applicationId: app.id,
      };
      if (needsHuman) {
        return { outcome: "PENDING_REVIEW", reason: "needs_human_review", payload };
      }
      const positive = POSITIVE_RECOMMENDATIONS.has(result.aiRecommendation);
      const scoreOk =
        config.minScore === undefined || result.memberWorthTotal >= config.minScore;
      if (positive && scoreOk) {
        return { outcome: "SATISFIED", payload };
      }
      return { outcome: "REJECTED", reason: "below_threshold", payload };
    },
    feedsProfile(proof) {
      const payload = proof.payload as { archetype?: string; score?: number } | null;
      if (!payload?.archetype) return null;
      return { archetype: payload.archetype, memberWorthTotal: payload.score ?? null };
    },
  };
}
