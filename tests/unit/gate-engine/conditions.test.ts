/** Per-verifier unit tests with fake ports - no database, no network (Stage 17). */
import type { Member } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { ScoringResult } from "@/lib/scoring";
import { createAnswerQuestionsCondition } from "@/lib/gate-engine/conditions/answer-questions";
import { createAttendedPriorCondition } from "@/lib/gate-engine/conditions/attended-prior";
import { createHoldMembershipCondition } from "@/lib/gate-engine/conditions/hold-membership";
import { createPayCondition, type StripeIntentSnapshot } from "@/lib/gate-engine/conditions/pay";
import { createReferredByMemberCondition } from "@/lib/gate-engine/conditions/referred-by-member";
import type { GateProof } from "@prisma/client";

const WORKSPACE = "ws_1";
const RESOURCE = { type: "EVENT" as const, id: "evt_1" };

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "mem_1",
    workspaceId: WORKSPACE,
    email: "guest@example.com",
    status: "GUEST",
    approved: false,
    redListed: false,
    referredByMemberId: null,
    ...overrides,
  } as Member;
}

function verifyArgs(overrides: {
  config?: unknown;
  submission?: unknown;
  member?: Member;
  nodeId?: string;
}) {
  return {
    config: overrides.config as never,
    submission: overrides.submission,
    member: overrides.member ?? member(),
    workspaceId: WORKSPACE,
    resource: RESOURCE,
    nodeId: overrides.nodeId ?? "node_test",
  };
}

describe("PAY verifier", () => {
  const intents: Record<string, StripeIntentSnapshot> = {
    pi_ok: {
      id: "pi_ok",
      status: "succeeded",
      amount_received: 2500,
      currency: "usd",
      metadata: { memberId: "mem_1" },
    },
    pi_underpaid: {
      id: "pi_underpaid",
      status: "succeeded",
      amount_received: 100,
      currency: "usd",
      metadata: { memberId: "mem_1" },
    },
    pi_pending: {
      id: "pi_pending",
      status: "requires_capture",
      amount_received: 0,
      currency: "usd",
      metadata: { memberId: "mem_1" },
    },
    pi_eur: {
      id: "pi_eur",
      status: "succeeded",
      amount_received: 2500,
      currency: "eur",
      metadata: { memberId: "mem_1" },
    },
    pi_other_member: {
      id: "pi_other_member",
      status: "succeeded",
      amount_received: 2500,
      currency: "usd",
      metadata: { memberId: "mem_SOMEONE_ELSE" },
    },
  };
  const readIntent = async (id: string) => intents[id] ?? null;
  const config = { priceCents: 2500, currency: "usd" };

  function pay(ownsIntent = async () => false) {
    return createPayCondition({ readIntent, ownsIntent });
  }

  it("satisfies on a succeeded, sufficient, owned intent", async () => {
    const outcome = await pay().verify(
      verifyArgs({ config, submission: { paymentIntentId: "pi_ok" } })
    );
    expect(outcome.outcome).toBe("SATISFIED");
    expect(outcome.payload).toMatchObject({ paymentIntentId: "pi_ok", amountReceived: 2500 });
  });

  it("rejects a missing or malformed submission", async () => {
    const outcome = await pay().verify(verifyArgs({ config, submission: undefined }));
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "missing_payment_intent" });
  });

  it("rejects an unknown intent", async () => {
    const outcome = await pay().verify(
      verifyArgs({ config, submission: { paymentIntentId: "pi_nope" } })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "intent_not_found" });
  });

  it("rejects a non-succeeded intent (authorize-only is not payment)", async () => {
    const outcome = await pay().verify(
      verifyArgs({ config, submission: { paymentIntentId: "pi_pending" } })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "intent_not_succeeded" });
  });

  it("rejects an amount below the configured price", async () => {
    const outcome = await pay().verify(
      verifyArgs({ config, submission: { paymentIntentId: "pi_underpaid" } })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "amount_below_price" });
  });

  it("rejects a currency mismatch", async () => {
    const outcome = await pay().verify(
      verifyArgs({ config, submission: { paymentIntentId: "pi_eur" } })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "currency_mismatch" });
  });

  it("replay defense: rejects someone else's intent unless an internal record ties it to the member", async () => {
    const rejected = await pay().verify(
      verifyArgs({ config, submission: { paymentIntentId: "pi_other_member" } })
    );
    expect(rejected).toMatchObject({ outcome: "REJECTED", reason: "intent_not_owned_by_member" });

    const viaInternalRecord = await pay(async () => true).verify(
      verifyArgs({ config, submission: { paymentIntentId: "pi_other_member" } })
    );
    expect(viaInternalRecord.outcome).toBe("SATISFIED");
  });
});

describe("ANSWER_QUESTIONS verifier", () => {
  const scoring = (overrides: Partial<ScoringResult> = {}): ScoringResult => ({
    archetype: "Connector",
    archetypeScores: { Connector: 80, Host: 10, Builder: 10, Patron: 10, Sage: 10, Spark: 10 },
    dimensionScores: { influence: 7, contribution: 7, activation: 7, taste: 7 },
    memberWorthTotal: 82,
    aiRecommendation: "yes",
    aiReasoning: "Strong fit.",
    tags: ["warm"],
    ...overrides,
  });

  const app: import("@/lib/gate-engine/conditions/answer-questions").ApplicationSnapshot = {
    id: "app_1",
    workspaceId: WORKSPACE,
    memberId: "mem_1",
    email: "guest@example.com",
    templateId: null,
  };

  function answers(result: ScoringResult, application = app) {
    return createAnswerQuestionsCondition({
      loadApplication: async (id) => (id === application.id ? application : null),
      score: async () => result,
    });
  }

  it("satisfies on a positive recommendation and carries {score, archetype, needsHuman}", async () => {
    const outcome = await answers(scoring()).verify(
      verifyArgs({ config: {}, submission: { applicationId: "app_1" } })
    );
    expect(outcome.outcome).toBe("SATISFIED");
    expect(outcome.payload).toMatchObject({ score: 82, archetype: "Connector", needsHuman: false });
  });

  it("maps 'unclear' to PENDING_REVIEW with needsHuman true - never Open", async () => {
    const outcome = await answers(scoring({ aiRecommendation: "unclear" })).verify(
      verifyArgs({ config: {}, submission: { applicationId: "app_1" } })
    );
    expect(outcome).toMatchObject({ outcome: "PENDING_REVIEW", reason: "needs_human_review" });
    expect(outcome.payload).toMatchObject({ needsHuman: true });
  });

  it("rejects negative recommendations", async () => {
    const outcome = await answers(scoring({ aiRecommendation: "no" })).verify(
      verifyArgs({ config: {}, submission: { applicationId: "app_1" } })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "below_threshold" });
  });

  it("enforces config.minScore even on a positive recommendation", async () => {
    const outcome = await answers(scoring({ memberWorthTotal: 70 })).verify(
      verifyArgs({ config: { minScore: 80 }, submission: { applicationId: "app_1" } })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "below_threshold" });
  });

  it("rejects a cross-workspace application (workspace is the security boundary)", async () => {
    const outcome = await answers(scoring(), { ...app, workspaceId: "ws_OTHER" }).verify(
      verifyArgs({ config: {}, submission: { applicationId: "app_1" } })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "application_workspace_mismatch" });
  });

  it("rejects an application that belongs to neither the member id nor their email", async () => {
    const outcome = await answers(scoring(), {
      ...app,
      memberId: "mem_OTHER",
      email: "other@example.com",
    }).verify(verifyArgs({ config: {}, submission: { applicationId: "app_1" } }));
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "application_not_owned_by_member" });
  });

  it("accepts ownership via case-insensitive email match when memberId is unlinked", async () => {
    const outcome = await answers(scoring(), {
      ...app,
      memberId: null,
      email: "GUEST@example.com",
    }).verify(verifyArgs({ config: {}, submission: { applicationId: "app_1" } }));
    expect(outcome.outcome).toBe("SATISFIED");
  });
});

describe("REFERRED_BY_MEMBER verifier", () => {
  it("rejects when no referrer is on record", async () => {
    const def = createReferredByMemberCondition({ referrerExists: async () => true });
    const outcome = await def.verify(verifyArgs({ config: {}, member: member() }));
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "no_referrer_on_record" });
  });

  it("rejects a referrer outside the workspace", async () => {
    const def = createReferredByMemberCondition({ referrerExists: async () => false });
    const outcome = await def.verify(
      verifyArgs({ config: {}, member: member({ referredByMemberId: "mem_ref" }) })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "referrer_not_in_workspace" });
  });

  it("satisfies on a workspace referrer and feeds a REFERRAL growth edge", async () => {
    const def = createReferredByMemberCondition({ referrerExists: async () => true });
    const outcome = await def.verify(
      verifyArgs({ config: {}, member: member({ referredByMemberId: "mem_ref" }) })
    );
    expect(outcome.outcome).toBe("SATISFIED");
    const edge = def.feedsGrowthGraph!(
      { payload: outcome.payload } as unknown as GateProof,
      { workspaceId: WORKSPACE, memberId: "mem_1" }
    );
    expect(edge).toEqual({ type: "REFERRAL", fromMemberId: "mem_ref", toMemberId: "mem_1" });
  });
});

describe("ATTENDED_PRIOR verifier", () => {
  function attended(count: number) {
    return createAttendedPriorCondition({ countCheckIns: async () => count });
  }

  it("rejects with zero prior check-ins", async () => {
    const outcome = await attended(0).verify(verifyArgs({ config: { minCount: 1 } }));
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "insufficient_prior_attendance" });
  });

  it("satisfies at the default minimum of one check-in", async () => {
    const outcome = await attended(1).verify(verifyArgs({ config: { minCount: 1 } }));
    expect(outcome.outcome).toBe("SATISFIED");
    expect(outcome.payload).toMatchObject({ attendedCount: 1 });
  });

  it("enforces a higher configured minimum", async () => {
    const outcome = await attended(2).verify(verifyArgs({ config: { minCount: 3 } }));
    expect(outcome.outcome).toBe("REJECTED");
  });
});

describe("HOLD_MEMBERSHIP verifier (LIVE re-verify - the 2026-07-01 unlock)", () => {
  const def = createHoldMembershipCondition();

  it("satisfies a current approved member", async () => {
    const outcome = await def.verify(
      verifyArgs({ config: {}, member: member({ status: "APPROVED", approved: true }) })
    );
    expect(outcome.outcome).toBe("SATISFIED");
  });

  it("rejects a red-listed member even when otherwise approved", async () => {
    const outcome = await def.verify(
      verifyArgs({
        config: {},
        member: member({ status: "APPROVED", approved: true, redListed: true }),
      })
    );
    expect(outcome).toMatchObject({ outcome: "REJECTED", reason: "member_red_listed" });
  });

  it("rejects guests and unapproved members", async () => {
    expect(
      (await def.verify(verifyArgs({ config: {}, member: member({ status: "GUEST" }) }))).outcome
    ).toBe("REJECTED");
    expect(
      (
        await def.verify(
          verifyArgs({ config: {}, member: member({ status: "APPROVED", approved: false }) })
        )
      ).outcome
    ).toBe("REJECTED");
  });

  it("is LIVE: never carried forward, re-verified every evaluation", () => {
    expect(def.carryForward).toEqual({ kind: "LIVE" });
    expect(def.isPassive).toBe(true);
  });
});
