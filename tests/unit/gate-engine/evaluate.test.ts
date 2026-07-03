/** Truth tables for the pure recursive evaluator (Stage 17).
 *  These tests are the normative encoding of the evaluation semantics in
 *  lib/gate-engine/evaluate.ts. No mocks, no I/O, no clocks.
 */
import { describe, expect, it } from "vitest";
import { evaluateTree } from "@/lib/gate-engine/evaluate";
import type { GateTreeNode, ProofIndex, ProofSnapshot } from "@/lib/gate-engine/types";

const NOW = new Date("2026-07-01T12:00:00.000Z");
const TYPES: ReadonlySet<string> = new Set(["A", "B", "C", "D"]);
const OPTS = { now: NOW, registeredTypes: TYPES };

function cond(
  id: string,
  overrides: Partial<GateTreeNode> = {}
): GateTreeNode {
  return {
    id,
    kind: "CONDITION",
    required: false,
    weight: null,
    rule: null,
    requiredCount: null,
    weightThreshold: null,
    children: [],
    conditionType: "A",
    config: {},
    ...overrides,
  };
}

function grp(
  id: string,
  rule: "ALL" | "ANY_N" | "WEIGHTED" | null,
  children: GateTreeNode[],
  overrides: Partial<GateTreeNode> = {}
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
    ...overrides,
  };
}

function satisfied(expiresAt: Date | null = null): ProofSnapshot {
  return { status: "SATISFIED", expiresAt };
}

function proofs(entries: Record<string, ProofSnapshot>): ProofIndex {
  return new Map(Object.entries(entries));
}

describe("evaluateTree - ALL groups", () => {
  it("opens when every child is satisfied", () => {
    const tree = grp("root", "ALL", [cond("a"), cond("b")]);
    const r = evaluateTree(tree, proofs({ a: satisfied(), b: satisfied() }), OPTS);
    expect(r.open).toBe(true);
    expect(r.structuralViolation).toBe(false);
  });

  it("closes when any child lacks a proof", () => {
    const tree = grp("root", "ALL", [cond("a"), cond("b")]);
    const r = evaluateTree(tree, proofs({ a: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.nodes.find((n) => n.nodeId === "b")?.reason).toBe("NO_PROOF");
  });
});

describe("evaluateTree - ANY_N groups", () => {
  it("ANY_N(1) opens on a single satisfied child (OR semantics)", () => {
    const tree = grp("root", "ANY_N", [cond("a"), cond("b")], { requiredCount: 1 });
    const r = evaluateTree(tree, proofs({ b: satisfied() }), OPTS);
    expect(r.open).toBe(true);
  });

  it("ANY_N(2) needs two satisfied children", () => {
    const tree = grp("root", "ANY_N", [cond("a"), cond("b"), cond("c")], {
      requiredCount: 2,
    });
    expect(evaluateTree(tree, proofs({ a: satisfied() }), OPTS).open).toBe(false);
    expect(
      evaluateTree(tree, proofs({ a: satisfied(), c: satisfied() }), OPTS).open
    ).toBe(true);
  });

  it("ANY_N without requiredCount is malformed - fail-closed", () => {
    const tree = grp("root", "ANY_N", [cond("a")]);
    const r = evaluateTree(tree, proofs({ a: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.structuralViolation).toBe(true);
  });
});

describe("evaluateTree - WEIGHTED groups", () => {
  const weightedTree = () =>
    grp(
      "root",
      "WEIGHTED",
      [
        cond("a", { weight: 3 }),
        cond("b", { weight: 2 }),
        cond("c", { weight: 4 }),
      ],
      { weightThreshold: 5 }
    );

  it("opens when satisfied weights reach the threshold", () => {
    const r = evaluateTree(weightedTree(), proofs({ a: satisfied(), b: satisfied() }), OPTS);
    expect(r.open).toBe(true);
  });

  it("closes below the threshold", () => {
    const r = evaluateTree(weightedTree(), proofs({ c: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.nodes.find((n) => n.nodeId === "root")?.reason).toBe("RULE_UNMET");
  });

  it("a child without weight contributes zero", () => {
    const tree = grp("root", "WEIGHTED", [cond("a"), cond("b", { weight: 4 })], {
      weightThreshold: 5,
    });
    const r = evaluateTree(tree, proofs({ a: satisfied(), b: satisfied() }), OPTS);
    expect(r.open).toBe(false);
  });

  it("WEIGHTED without a threshold is malformed - fail-closed", () => {
    const tree = grp("root", "WEIGHTED", [cond("a", { weight: 5 })]);
    const r = evaluateTree(tree, proofs({ a: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.structuralViolation).toBe(true);
  });
});

describe("evaluateTree - required children (acceptance criterion 3)", () => {
  it("an unsatisfied required child blocks Open inside an ANY group", () => {
    const tree = grp(
      "root",
      "ANY_N",
      [cond("must", { required: true }), cond("b")],
      { requiredCount: 1 }
    );
    const r = evaluateTree(tree, proofs({ b: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.nodes.find((n) => n.nodeId === "root")?.reason).toBe(
      "REQUIRED_CHILD_UNSATISFIED"
    );
  });

  it("a satisfied required child both unblocks and counts toward ANY_N", () => {
    const tree = grp(
      "root",
      "ANY_N",
      [cond("must", { required: true }), cond("b")],
      { requiredCount: 1 }
    );
    const r = evaluateTree(tree, proofs({ must: satisfied() }), OPTS);
    expect(r.open).toBe(true);
  });

  it("an unsatisfied required child blocks a WEIGHTED group that meets its threshold", () => {
    const tree = grp(
      "root",
      "WEIGHTED",
      [cond("must", { required: true, weight: 1 }), cond("b", { weight: 5 })],
      { weightThreshold: 5 }
    );
    const r = evaluateTree(tree, proofs({ b: satisfied() }), OPTS);
    expect(r.open).toBe(false);
  });
});

describe("evaluateTree - nested depth-2 (acceptance criterion 1, pure form)", () => {
  // PAY AND (REFERRED OR ANSWER) as: ALL [pay, ANY_N(1) [ref, ans]]
  const nested = () =>
    grp("root", "ALL", [
      cond("pay", { conditionType: "A" }),
      grp("branch", "ANY_N", [
        cond("ref", { conditionType: "B" }),
        cond("ans", { conditionType: "C" }),
      ], { requiredCount: 1 }),
    ]);

  it("open only when PAY and at least one branch condition hold", () => {
    expect(
      evaluateTree(nested(), proofs({ pay: satisfied(), ref: satisfied() }), OPTS).open
    ).toBe(true);
    expect(
      evaluateTree(nested(), proofs({ pay: satisfied(), ans: satisfied() }), OPTS).open
    ).toBe(true);
  });

  it("not-Open when the ALL child PAY fails, even with both branch conditions", () => {
    expect(
      evaluateTree(nested(), proofs({ ref: satisfied(), ans: satisfied() }), OPTS).open
    ).toBe(false);
  });

  it("not-Open when the branch fails, even with PAY", () => {
    expect(evaluateTree(nested(), proofs({ pay: satisfied() }), OPTS).open).toBe(false);
  });

  it("leaf predicates are position-agnostic", () => {
    const flipped = grp("root", "ALL", [
      grp("branch", "ANY_N", [
        cond("ans", { conditionType: "C" }),
        cond("ref", { conditionType: "B" }),
      ], { requiredCount: 1 }),
      cond("pay", { conditionType: "A" }),
    ]);
    const index = proofs({ pay: satisfied(), ans: satisfied() });
    expect(evaluateTree(flipped, index, OPTS).open).toBe(true);
  });
});

describe("evaluateTree - depth ceiling (§16.1 LOCKED: flat + depth-2)", () => {
  it("a group nested beyond depth 1 closes the gate even with satisfied proofs", () => {
    const tree = grp("root", "ALL", [
      grp("g1", "ALL", [grp("g2", "ALL", [cond("a")])]),
    ]);
    const r = evaluateTree(tree, proofs({ a: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.structuralViolation).toBe(true);
    expect(r.nodes.find((n) => n.nodeId === "g2")?.reason).toBe("DEPTH_EXCEEDED");
  });

  it("depth-2 conditions (root -> group -> condition) are the allowed maximum", () => {
    const tree = grp("root", "ALL", [grp("g1", "ALL", [cond("a")])]);
    const r = evaluateTree(tree, proofs({ a: satisfied() }), OPTS);
    expect(r.open).toBe(true);
  });
});

describe("evaluateTree - fail-closed matrix (acceptance criterion 6, pure form)", () => {
  it("null root closes", () => {
    const r = evaluateTree(null, new Map(), OPTS);
    expect(r.open).toBe(false);
    expect(r.structuralViolation).toBe(true);
  });

  it("a bare condition at root closes (root must be a GROUP)", () => {
    const r = evaluateTree(cond("a"), proofs({ a: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.nodes[0]?.reason).toBe("ROOT_NOT_GROUP");
  });

  it("an empty group closes", () => {
    const r = evaluateTree(grp("root", "ALL", []), new Map(), OPTS);
    expect(r.open).toBe(false);
    expect(r.nodes[0]?.reason).toBe("EMPTY_GROUP");
  });

  it("a group without a rule closes", () => {
    const r = evaluateTree(grp("root", null, [cond("a")]), proofs({ a: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.structuralViolation).toBe(true);
  });

  it("an unregistered condition type closes the WHOLE gate, even inside a satisfied OR branch", () => {
    const tree = grp("root", "ANY_N", [
      cond("good", { conditionType: "A" }),
      cond("bad", { conditionType: "NOT_REGISTERED" }),
    ], { requiredCount: 1 });
    const r = evaluateTree(tree, proofs({ good: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.structuralViolation).toBe(true);
    expect(r.nodes.find((n) => n.nodeId === "bad")?.reason).toBe("UNREGISTERED_CONDITION");
  });

  it("a condition with a null conditionType closes", () => {
    const tree = grp("root", "ALL", [cond("a", { conditionType: null })]);
    const r = evaluateTree(tree, new Map(), OPTS);
    expect(r.open).toBe(false);
    expect(r.structuralViolation).toBe(true);
  });

  it("a condition with children is malformed", () => {
    const tree = grp("root", "ALL", [cond("a", { children: [cond("x")] })]);
    const r = evaluateTree(tree, proofs({ a: satisfied() }), OPTS);
    expect(r.open).toBe(false);
    expect(r.structuralViolation).toBe(true);
  });

  it("REJECTED and PENDING_REVIEW proofs never satisfy", () => {
    const tree = grp("root", "ALL", [cond("a"), cond("b")]);
    const r = evaluateTree(
      tree,
      proofs({
        a: { status: "REJECTED", expiresAt: null },
        b: { status: "PENDING_REVIEW", expiresAt: null },
      }),
      OPTS
    );
    expect(r.open).toBe(false);
    expect(r.nodes.find((n) => n.nodeId === "a")?.reason).toBe("PROOF_NOT_SATISFIED");
    expect(r.nodes.find((n) => n.nodeId === "b")?.reason).toBe("PROOF_NOT_SATISFIED");
  });
});

describe("evaluateTree - proof expiry boundaries", () => {
  it("a proof expiring exactly now is expired (closed)", () => {
    const tree = grp("root", "ALL", [cond("a")]);
    const r = evaluateTree(tree, proofs({ a: satisfied(NOW) }), OPTS);
    expect(r.open).toBe(false);
    expect(r.nodes.find((n) => n.nodeId === "a")?.reason).toBe("PROOF_EXPIRED");
  });

  it("a proof expiring one millisecond later is live (open)", () => {
    const tree = grp("root", "ALL", [cond("a")]);
    const r = evaluateTree(
      tree,
      proofs({ a: satisfied(new Date(NOW.getTime() + 1)) }),
      OPTS
    );
    expect(r.open).toBe(true);
  });
});
