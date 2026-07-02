/** Guest-safe projection tests (Stage 17, M2).
 *
 *  The projector is the only layer between engine state and a guest's eyes.
 *  These tests pin its two hard guarantees: nothing internal leaks (enums,
 *  reason codes, decline reasons), and every emitted string is brand-law
 *  clean.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createDefaultConditionDefs } from "@/lib/gate-engine/conditions/defaults";
import { projectGuestView } from "@/lib/gate-engine/guest-view";
import { createConditionRegistry } from "@/lib/gate-engine/registry";
import type {
  ConditionTypeDef,
  GateEvaluation,
  GateTreeNode,
  ProofIndex,
} from "@/lib/gate-engine/types";

const dummy = (type: string, prompt: string): ConditionTypeDef<unknown> => ({
  type,
  verificationTier: "FIRST_PARTY",
  proofMechanism: "INTERNAL_RECORD",
  configSchema: z.object({}).passthrough(),
  guestPrompt: () => prompt,
  isPassive: false,
  carryForward: { kind: "NEVER" },
  verify: async () => ({ outcome: "SATISFIED" }),
});

const registry = createConditionRegistry([
  dummy("A", "Step A prompt."),
  dummy("B", "Step B prompt."),
]);

function cond(id: string, conditionType = "A", required = false): GateTreeNode {
  return {
    id,
    kind: "CONDITION",
    required,
    weight: null,
    rule: null,
    requiredCount: null,
    weightThreshold: null,
    children: [],
    conditionType,
    config: {},
  };
}

function grp(
  id: string,
  rule: "ALL" | "ANY_N" | "WEIGHTED",
  children: GateTreeNode[],
  extra: Partial<GateTreeNode> = {}
): GateTreeNode {
  return {
    id,
    kind: "GROUP",
    required: false,
    weight: null,
    rule,
    requiredCount: null,
    weightThreshold: null,
    children,
    conditionType: null,
    config: null,
    ...extra,
  };
}

function evaluation(
  satisfied: Record<string, boolean>,
  open: boolean,
  structuralViolation = false
): GateEvaluation {
  return {
    open,
    structuralViolation,
    nodes: Object.entries(satisfied).map(([nodeId, ok]) => ({
      nodeId,
      satisfied: ok,
      reason: ok ? "SATISFIED_BY_PROOF" : "NO_PROOF",
    })),
  };
}

describe("projectGuestView", () => {
  const nested = () =>
    grp("root", "ALL", [
      cond("pay", "A"),
      grp("branch", "ANY_N", [cond("ref", "B"), cond("ans", "B")], {
        requiredCount: 1,
      }),
    ]);

  it("pre-identity: prompts visible, everything needed, gate closed", () => {
    const view = projectGuestView({
      tree: nested(),
      evaluation: null,
      proofs: new Map(),
      registry,
      needsIdentity: true,
    });
    expect(view.available).toBe(true);
    if (!view.available) return;
    expect(view.open).toBe(false);
    expect(view.needsIdentity).toBe(true);
    expect(view.sections).toHaveLength(2);
    expect(view.sections[0].headline).toBe("Complete all of these");
    expect(view.sections[1].headline).toBe("Complete any one of these");
    expect(view.sections.flatMap((s) => s.steps).every((s) => s.state === "needed")).toBe(true);
  });

  it("open gate: 'You're on the list' with completed steps", () => {
    const view = projectGuestView({
      tree: nested(),
      evaluation: evaluation({ pay: true, ref: true, ans: false, branch: true, root: true }, true),
      proofs: new Map(),
      registry,
      needsIdentity: false,
    });
    if (!view.available) throw new Error("expected available");
    expect(view.open).toBe(true);
    expect(view.headline).toBe("You're on the list");
    const pay = view.sections[0].steps.find((s) => s.nodeId === "pay");
    expect(pay?.state).toBe("complete");
  });

  it("PENDING_REVIEW renders as in_review; REJECTED renders as needed (no decline reasons for guests)", () => {
    const proofs: ProofIndex = new Map([
      ["ref", { status: "PENDING_REVIEW", expiresAt: null }],
      ["ans", { status: "REJECTED", expiresAt: null }],
    ]);
    const view = projectGuestView({
      tree: nested(),
      evaluation: evaluation({ pay: false, ref: false, ans: false, branch: false, root: false }, false),
      proofs,
      registry,
      needsIdentity: false,
    });
    if (!view.available) throw new Error("expected available");
    const steps = view.sections.flatMap((s) => s.steps);
    expect(steps.find((s) => s.nodeId === "ref")?.state).toBe("in_review");
    expect(steps.find((s) => s.nodeId === "ans")?.state).toBe("needed");
  });

  it("exposes the required flag for UI without leaking rule mechanics", () => {
    const tree = grp("root", "ANY_N", [cond("must", "A", true), cond("opt", "B")], {
      requiredCount: 1,
    });
    const view = projectGuestView({
      tree,
      evaluation: null,
      proofs: new Map(),
      registry,
      needsIdentity: true,
    });
    if (!view.available) throw new Error("expected available");
    expect(view.sections[0].steps.find((s) => s.nodeId === "must")?.required).toBe(true);
  });

  it("ANY_N(2) and WEIGHTED get intuitive headlines", () => {
    const tree = grp("root", "ALL", [
      grp("g1", "ANY_N", [cond("a"), cond("b"), cond("c")], { requiredCount: 2 }),
      grp("g2", "WEIGHTED", [cond("d"), cond("e")], { weightThreshold: 5 }),
    ]);
    const view = projectGuestView({
      tree,
      evaluation: null,
      proofs: new Map(),
      registry,
      needsIdentity: true,
    });
    if (!view.available) throw new Error("expected available");
    expect(view.sections.map((s) => s.headline)).toEqual([
      "Complete any 2 of these",
      "Complete enough of these",
    ]);
  });

  it("fail-closed: null tree, structural violations, and unregistered types render unavailable", () => {
    expect(
      projectGuestView({ tree: null, evaluation: null, proofs: new Map(), registry, needsIdentity: true })
    ).toEqual({ available: false });

    expect(
      projectGuestView({
        tree: nested(),
        evaluation: evaluation({}, false, true),
        proofs: new Map(),
        registry,
        needsIdentity: false,
      })
    ).toEqual({ available: false });

    const withUnregistered = grp("root", "ALL", [cond("x", "NOT_REGISTERED")]);
    expect(
      projectGuestView({
        tree: withUnregistered,
        evaluation: null,
        proofs: new Map(),
        registry,
        needsIdentity: true,
      })
    ).toEqual({ available: false });
  });

  it("brand-law sweep: every string from the five real condition types is clean", () => {
    const realRegistry = createConditionRegistry(createDefaultConditionDefs());
    const tree = grp("root", "ALL", [
      cond("pay", "PAY"),
      grp(
        "branch",
        "ANY_N",
        [
          cond("ref", "REFERRED_BY_MEMBER"),
          cond("ans", "ANSWER_QUESTIONS"),
          cond("att", "ATTENDED_PRIOR"),
          cond("hold", "HOLD_MEMBERSHIP"),
        ],
        { requiredCount: 1 }
      ),
    ]);
    // PAY needs a valid config for its prompt.
    tree.children[0].config = { priceCents: 2500 };

    const view = projectGuestView({
      tree,
      evaluation: null,
      proofs: new Map(),
      registry: realRegistry,
      needsIdentity: true,
    });
    if (!view.available) throw new Error("expected available");

    const strings = [
      view.headline,
      ...view.sections.map((s) => s.headline),
      ...view.sections.flatMap((s) => s.steps.map((st) => st.prompt)),
    ];
    for (const s of strings) {
      expect(s.length).toBeGreaterThan(0);
      expect(s).not.toMatch(/rsvp/i);
      expect(s).not.toMatch(/\bNBC\b/);
      expect(s).not.toContain("—");
      expect(s).not.toMatch(
        /\b(ANY_N|WEIGHTED|CONDITION|GROUP|SATISFIED|REJECTED|PENDING_REVIEW|FIRST_PARTY|AI_ATTESTED|TICKETED)\b/
      );
    }
    // The ticket step carries the canonical CTA with a spaced hyphen.
    expect(strings.join(" ")).toContain("Get Ticket - $25.00");
  });
});
