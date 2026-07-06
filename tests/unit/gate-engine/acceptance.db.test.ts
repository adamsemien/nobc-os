/** Gate Engine M1 acceptance suite - the six M1 -> M2 criteria, proven on
 *  REAL seeded rows against the confirmed dev branch (ep-sweet-term).
 *
 *  Env-gated so CI stays green: runs only with GATE_M1_DB_TESTS=1.
 *    GATE_M1_DB_TESTS=1 node_modules/.bin/vitest run tests/unit/gate-engine/acceptance.db.test.ts
 *
 *  Stripe and the AI scorer are injected ports (no network, no model calls);
 *  every proof, node, member, Access record, and growth edge is a real
 *  database row. The seeded world is left in place after the run for
 *  inspection (workspace slug "gate-m1-acceptance"); the next run cleans it.
 */
import "./helpers/env";
import { z } from "zod";
import { beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { ScoringResult } from "@/lib/scoring";
import { createGateEngine, type GateEngine } from "@/lib/gate-engine/orchestrate";
import { createConditionRegistry } from "@/lib/gate-engine/registry";
import { createAnswerQuestionsCondition } from "@/lib/gate-engine/conditions/answer-questions";
import { createAttendedPriorCondition } from "@/lib/gate-engine/conditions/attended-prior";
import { createHoldMembershipCondition } from "@/lib/gate-engine/conditions/hold-membership";
import { createPayCondition, type StripeIntentSnapshot } from "@/lib/gate-engine/conditions/pay";
import { createReferredByMemberCondition } from "@/lib/gate-engine/conditions/referred-by-member";
import type { ConditionTypeDef } from "@/lib/gate-engine/types";
import {
  makeEvent,
  seedAcceptanceWorld,
  type AcceptanceWorld,
} from "./helpers/seed";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;

const T = 90_000; // Neon round trips over HTTP - generous per-test timeout

// Lazy so a skipped run (no GATE_M1_DB_TESTS) never constructs the client.
let db: PrismaClient;
let world: AcceptanceWorld;
let engine: GateEngine;
let attendedVerifierCalls = 0;
let scorerCalls = 0;
let fakeIntents: Record<string, StripeIntentSnapshot>;

const yesScore = (): ScoringResult => ({
  archetype: "Connector",
  archetypeScores: { Connector: 82, Host: 40, Builder: 40, Patron: 40, Sage: 40, Spark: 40 },
  dimensionScores: { influence: 8, contribution: 8, activation: 8, taste: 8 },
  memberWorthTotal: 82,
  aiRecommendation: "yes",
  aiReasoning: "Acceptance fixture: strong fit.",
  tags: ["acceptance"],
});

describeDb("Gate Engine M1 acceptance (real rows on ep-sweet-term)", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    world = await seedAcceptanceWorld(db);

    fakeIntents = {
      pi_gate_ok: {
        id: "pi_gate_ok",
        status: "succeeded",
        amount_received: 2500,
        currency: "usd",
        metadata: { memberId: world.referredGuest.id },
      },
      pi_paid_only: {
        id: "pi_paid_only",
        status: "succeeded",
        amount_received: 2500,
        currency: "usd",
        metadata: { memberId: world.paidOnlyGuest.id },
      },
    };

    const exploder: ConditionTypeDef<Record<string, never>> = {
      type: "EXPLODER",
      verificationTier: "FIRST_PARTY",
      proofMechanism: "INTERNAL_RECORD",
      configSchema: z.object({}).strict() as never,
      guestPrompt: () => "Acceptance fixture.",
      isPassive: true,
      carryForward: { kind: "NEVER" },
      verify: async () => {
        throw new Error("acceptance fixture: verifier exploded");
      },
    };

    const registry = createConditionRegistry([
      createPayCondition({
        readIntent: async (id) => fakeIntents[id] ?? null,
        ownsIntent: async () => false, // metadata traceability only in this suite
      }),
      createAnswerQuestionsCondition({
        // Real application rows via the default loader; only the frozen
        // scorer call itself is faked (no model call in tests).
        score: async (applicationId) => {
          scorerCalls++;
          if (applicationId === world.unclearApplicationId) {
            return { ...yesScore(), aiRecommendation: "unclear" };
          }
          return yesScore();
        },
      }),
      createReferredByMemberCondition(),
      createAttendedPriorCondition({
        countCheckIns: async (args) => {
          attendedVerifierCalls++;
          return db.rSVP.count({
            where: { workspaceId: args.workspaceId, memberId: args.memberId, checkedIn: true },
          });
        },
      }),
      createHoldMembershipCondition(),
      exploder,
    ] as ConditionTypeDef<unknown>[]);

    engine = createGateEngine({ db, registry });
  }, 180_000);

  // Shared across sequential tests below.
  let mainGateId: string;
  let mainSessionId: string;

  it(
    "criterion 1: nested depth-2 gate PAY AND (REFERRED OR ANSWER) opens end-to-end and fails closed on a failing required branch",
    async () => {
      const eventId = await makeEvent(db, world.workspace.id, "gate-m1-main");
      const { gateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventId },
        name: "Main door",
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [
            { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } },
            {
              kind: "GROUP",
              rule: "ANY_N",
              requiredCount: 1,
              children: [
                { kind: "CONDITION", conditionType: "REFERRED_BY_MEMBER", config: {} },
                { kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} },
              ],
            },
          ],
        },
      });
      mainGateId = gateId;
      const session = await engine.createSession({
        workspaceId: world.workspace.id,
        gateId,
        memberId: world.referredGuest.id,
      });
      mainSessionId = session.sessionId;

      // Landing: the passive REFERRED branch auto-satisfies, PAY does not -
      // the ALL child fails, the gate stays closed.
      const beforePay = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId,
        memberId: world.referredGuest.id,
        sessionId: mainSessionId,
      });
      expect(beforePay.open).toBe(false);
      expect(beforePay.reason).toBe("EVALUATED");

      // Pay - the tree is now genuinely satisfied.
      const payNode = await db.gateNode.findFirst({
        where: { gateId, conditionType: "PAY" },
      });
      expect(payNode).not.toBeNull();
      const afterPay = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId,
        memberId: world.referredGuest.id,
        sessionId: mainSessionId,
        submissions: { [payNode!.id]: { paymentIntentId: "pi_gate_ok" } },
      });
      expect(afterPay.open).toBe(true);

      // A payer with NO satisfied branch stays closed - PAY alone is not enough.
      const paidOnlyPay = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId,
        memberId: world.paidOnlyGuest.id,
        submissions: { [payNode!.id]: { paymentIntentId: "pi_paid_only" } },
      });
      expect(paidOnlyPay.open).toBe(false);

      // The decision snapshot landed on the session row.
      const sessionRow = await db.gateSession.findUnique({ where: { id: mainSessionId } });
      expect(sessionRow?.status).toBe("SATISFIED");
      expect((sessionRow?.lastDecision as { open: boolean }).open).toBe(true);
    },
    T
  );

  it(
    "criterion 2: proofs persist with the correct tier + proofMechanism per condition",
    async () => {
      const payProof = await db.gateProof.findFirst({
        where: { memberId: world.referredGuest.id, conditionType: "PAY", workspaceId: world.workspace.id },
      });
      expect(payProof).toMatchObject({
        status: "SATISFIED",
        tier: "FIRST_PARTY",
        mechanism: "STRIPE_PAYMENT",
      });

      const referredProof = await db.gateProof.findFirst({
        where: { memberId: world.referredGuest.id, conditionType: "REFERRED_BY_MEMBER" },
      });
      expect(referredProof).toMatchObject({
        status: "SATISFIED",
        tier: "FIRST_PARTY",
        mechanism: "INTERNAL_RECORD",
      });

      // ANSWER_QUESTIONS: real Application row, wrapped scorer, AI-attested proof.
      const eventId = await makeEvent(db, world.workspace.id, "gate-m1-apply");
      const { gateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventId },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} }],
        },
      });
      const answerNode = await db.gateNode.findFirst({
        where: { gateId, conditionType: "ANSWER_QUESTIONS" },
      });
      const decision = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId,
        memberId: world.applicant.id,
        submissions: { [answerNode!.id]: { applicationId: world.applicationId } },
      });
      expect(decision.open).toBe(true);

      const answerProof = await db.gateProof.findFirst({
        where: { nodeId: answerNode!.id, memberId: world.applicant.id },
      });
      expect(answerProof).toMatchObject({
        status: "SATISFIED",
        tier: "AI_ATTESTED",
        mechanism: "AI_SCORING",
      });
      expect(answerProof?.payload).toMatchObject({
        score: 82,
        archetype: "Connector",
        needsHuman: false,
      });
      // The answers proof carries the 12-month window (§16.4).
      expect(answerProof?.expiresAt).not.toBeNull();
    },
    T
  );

  it(
    "criterion 3: a required child blocks Open inside an ANY group when unsatisfied",
    async () => {
      const eventId = await makeEvent(db, world.workspace.id, "gate-m1-required");
      const { gateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventId },
        spec: {
          kind: "GROUP",
          rule: "ANY_N",
          requiredCount: 1,
          children: [
            { kind: "CONDITION", conditionType: "HOLD_MEMBERSHIP", config: {}, required: true },
            { kind: "CONDITION", conditionType: "ATTENDED_PRIOR", config: {} },
          ],
        },
      });

      // The attendee satisfies ATTENDED_PRIOR (ANY is met) but the required
      // HOLD_MEMBERSHIP fails - the gate must stay closed.
      const attendeeDecision = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId,
        memberId: world.attendee.id,
      });
      expect(attendeeDecision.open).toBe(false);
      const root = attendeeDecision.evaluation?.nodes.find(
        (n) => n.reason === "REQUIRED_CHILD_UNSATISFIED"
      );
      expect(root).toBeDefined();

      // An approved member passes the required child and thereby the ANY rule.
      const memberDecision = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId,
        memberId: world.referrer.id,
      });
      expect(memberDecision.open).toBe(true);
    },
    T
  );

  it(
    "criterion 4: carry-forward pre-satisfies returning members without re-verifying; expired answers and payments never carry",
    async () => {
      // 4a - ATTENDED_PRIOR carries forever: the attendee satisfied it on the
      // criterion-3 gate; a brand-new gate must pre-satisfy WITHOUT calling
      // the verifier again.
      const eventA = await makeEvent(db, world.workspace.id, "gate-m1-carry-attended");
      const { gateId: attendedGateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventA },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "ATTENDED_PRIOR", config: {} }],
        },
      });
      const callsBefore = attendedVerifierCalls;
      const carried = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: attendedGateId,
        memberId: world.attendee.id,
      });
      expect(carried.open).toBe(true);
      expect(attendedVerifierCalls).toBe(callsBefore); // NOT re-verified
      const carriedProof = await db.gateProof.findFirst({
        where: {
          memberId: world.attendee.id,
          conditionType: "ATTENDED_PRIOR",
          nodeId: { not: null },
          sourceProofId: { not: null },
        },
      });
      expect(carriedProof).not.toBeNull();

      // 4b - ANSWER_QUESTIONS carries within 12 months (no scorer call)...
      const eventB = await makeEvent(db, world.workspace.id, "gate-m1-carry-answers");
      const { gateId: answersGateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventB },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} }],
        },
      });
      const scorerBefore = scorerCalls;
      const answersCarried = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: answersGateId,
        memberId: world.applicant.id,
      });
      expect(answersCarried.open).toBe(true);
      expect(scorerCalls).toBe(scorerBefore); // carried, not re-scored

      // ...but a 13-month-old answers proof does NOT carry (window lapsed).
      const thirteenMonthsAgo = new Date("2025-06-01T00:00:00.000Z");
      const lapsedExpiry = new Date("2026-06-01T00:00:00.000Z"); // in the past
      await db.gateProof.create({
        data: {
          workspaceId: world.workspace.id,
          nodeId: null, // orphaned historical proof (gate long deleted)
          memberId: world.staleApplicant.id,
          conditionType: "ANSWER_QUESTIONS",
          status: "SATISFIED",
          tier: "AI_ATTESTED",
          mechanism: "AI_SCORING",
          verifiedAt: thirteenMonthsAgo,
          expiresAt: lapsedExpiry,
        },
      });
      const eventC = await makeEvent(db, world.workspace.id, "gate-m1-stale-answers");
      const { gateId: staleGateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventC },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} }],
        },
      });
      const stale = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: staleGateId,
        memberId: world.staleApplicant.id,
      });
      expect(stale.open).toBe(false);
      const staleNodeProof = await db.gateProof.findFirst({
        where: { memberId: world.staleApplicant.id, nodeId: { not: null } },
      });
      expect(staleNodeProof).toBeNull(); // nothing was minted

      // 4c - PAY never carries (§16.4: payment is per-event).
      const eventD = await makeEvent(db, world.workspace.id, "gate-m1-pay-nocarry");
      const { gateId: payGateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventD },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } }],
        },
      });
      const payAgain = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: payGateId,
        memberId: world.referredGuest.id, // paid on the main gate already
      });
      expect(payAgain.open).toBe(false);
      const payNodes = await db.gateNode.findMany({
        where: { gateId: payGateId, conditionType: "PAY" },
        select: { id: true },
      });
      const carriedPay = await db.gateProof.findFirst({
        where: { memberId: world.referredGuest.id, nodeId: { in: payNodes.map((n) => n.id) } },
      });
      expect(carriedPay).toBeNull();
    },
    T
  );

  it(
    "criterion 5: a REFERRAL GrowthEdge is written when REFERRED_BY_MEMBER passes, and never duplicated",
    async () => {
      const edges = await db.growthEdge.findMany({
        where: {
          workspaceId: world.workspace.id,
          type: "REFERRAL",
          fromMemberId: world.referrer.id,
          toMemberId: world.referredGuest.id,
        },
      });
      expect(edges).toHaveLength(1);
      expect(edges[0].proofId).not.toBeNull();

      // Re-evaluating the main gate must not multiply edges.
      await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: mainGateId,
        memberId: world.referredGuest.id,
      });
      const after = await db.growthEdge.count({
        where: {
          workspaceId: world.workspace.id,
          type: "REFERRAL",
          fromMemberId: world.referrer.id,
          toMemberId: world.referredGuest.id,
        },
      });
      expect(after).toBe(1);
    },
    T
  );

  it(
    "criterion 6: verifier errors, unregistered types, needs-human states, and revocation all evaluate NOT Open",
    async () => {
      // 6a - a throwing verifier is fail-closed and surfaced as an error.
      const eventA = await makeEvent(db, world.workspace.id, "gate-m1-exploder");
      const { gateId: exploderGateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventA },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "EXPLODER", config: {} }],
        },
      });
      const exploded = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: exploderGateId,
        memberId: world.referrer.id,
      });
      expect(exploded.open).toBe(false);
      expect(exploded.verifierErrors).toContainEqual(
        expect.objectContaining({ code: "VERIFIER_ERROR" })
      );

      // 6b - an unregistered condition type (raw rows bypassing authoring
      // validation) is a structural violation: whole gate closed.
      const eventB = await makeEvent(db, world.workspace.id, "gate-m1-unregistered");
      const rawGate = await db.gate.create({
        data: {
          workspaceId: world.workspace.id,
          resourceType: "EVENT",
          resourceId: eventB,
        },
      });
      const rawRoot = await db.gateNode.create({
        data: {
          workspaceId: world.workspace.id,
          gateId: rawGate.id,
          kind: "GROUP",
          rule: "ALL",
        },
      });
      await db.gateNode.create({
        data: {
          workspaceId: world.workspace.id,
          gateId: rawGate.id,
          parentId: rawRoot.id,
          kind: "CONDITION",
          conditionType: "NOT_A_REGISTERED_TYPE",
          config: {},
        },
      });
      const unregistered = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: rawGate.id,
        memberId: world.referrer.id,
      });
      expect(unregistered.open).toBe(false);
      expect(unregistered.evaluation?.structuralViolation).toBe(true);

      // 6c - needsHuman (aiRecommendation "unclear") persists as
      // PENDING_REVIEW and never opens.
      const eventC = await makeEvent(db, world.workspace.id, "gate-m1-unclear");
      const { gateId: unclearGateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventC },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} }],
        },
      });
      const unclearNode = await db.gateNode.findFirst({
        where: { gateId: unclearGateId, conditionType: "ANSWER_QUESTIONS" },
      });
      const unclearDecision = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: unclearGateId,
        memberId: world.unclearApplicant.id,
        submissions: { [unclearNode!.id]: { applicationId: world.unclearApplicationId } },
      });
      expect(unclearDecision.open).toBe(false);
      const pendingProof = await db.gateProof.findFirst({
        where: { nodeId: unclearNode!.id, memberId: world.unclearApplicant.id },
      });
      expect(pendingProof?.status).toBe("PENDING_REVIEW");

      // 6d - HOLD_MEMBERSHIP is LIVE (the 2026-07-01 unlock): a member who
      // opened a gate yesterday and got red-listed today must NOT pass.
      const eventD = await makeEvent(db, world.workspace.id, "gate-m1-revocation");
      const { gateId: memberGateId } = await engine.createGate({
        workspaceId: world.workspace.id,
        resource: { type: "EVENT", id: eventD },
        spec: {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "CONDITION", conditionType: "HOLD_MEMBERSHIP", config: {} }],
        },
      });
      const beforeRevocation = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: memberGateId,
        memberId: world.revocable.id,
      });
      expect(beforeRevocation.open).toBe(true);

      await db.member.update({
        where: { id: world.revocable.id },
        data: { redListed: true },
      });
      const afterRevocation = await engine.evaluateGate({
        workspaceId: world.workspace.id,
        gateId: memberGateId,
        memberId: world.revocable.id,
      });
      expect(afterRevocation.open).toBe(false);
    },
    T
  );
});
