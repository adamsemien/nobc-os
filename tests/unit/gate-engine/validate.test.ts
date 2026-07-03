/** Authoring-time validation tests (Stage 17). */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createConditionRegistry } from "@/lib/gate-engine/registry";
import type { ConditionTypeDef, GateNodeSpec } from "@/lib/gate-engine/types";
import { validateGateSpec } from "@/lib/gate-engine/validate";

const dummy = (type: string): ConditionTypeDef<{ v?: number }> => ({
  type,
  verificationTier: "FIRST_PARTY",
  proofMechanism: "INTERNAL_RECORD",
  configSchema: z.object({ v: z.number().optional() }),
  guestPrompt: () => "Test prompt.",
  isPassive: false,
  carryForward: { kind: "NEVER" },
  verify: async () => ({ outcome: "SATISFIED" }),
});

const registry = createConditionRegistry([dummy("A"), dummy("B")] as ConditionTypeDef<unknown>[]);

const condition = (overrides: Partial<Extract<GateNodeSpec, { kind: "CONDITION" }>> = {}): GateNodeSpec => ({
  kind: "CONDITION",
  conditionType: "A",
  config: {},
  ...overrides,
});

function errorsOf(spec: GateNodeSpec): string[] {
  const result = validateGateSpec(spec, registry);
  return result.valid ? [] : result.errors;
}

describe("validateGateSpec", () => {
  it("accepts a canonical flat + depth-2 tree", () => {
    const spec: GateNodeSpec = {
      kind: "GROUP",
      rule: "ALL",
      children: [
        condition(),
        { kind: "GROUP", rule: "ANY_N", requiredCount: 1, children: [condition(), condition({ conditionType: "B" })] },
      ],
    };
    expect(validateGateSpec(spec, registry)).toEqual({ valid: true });
  });

  it("rejects a condition at root", () => {
    expect(errorsOf(condition())).toEqual(["root: must be a GROUP node"]);
  });

  it("rejects groups nested beyond the §16.1 ceiling", () => {
    const spec: GateNodeSpec = {
      kind: "GROUP",
      rule: "ALL",
      children: [
        {
          kind: "GROUP",
          rule: "ALL",
          children: [{ kind: "GROUP", rule: "ALL", children: [condition()] }],
        },
      ],
    };
    expect(errorsOf(spec).join(" ")).toContain("depth ceiling");
  });

  it("rejects an empty group", () => {
    expect(errorsOf({ kind: "GROUP", rule: "ALL", children: [] }).join(" ")).toContain(
      "at least one child"
    );
  });

  it("rejects ANY_N with requiredCount above the child count (unsatisfiable)", () => {
    const spec: GateNodeSpec = {
      kind: "GROUP",
      rule: "ANY_N",
      requiredCount: 3,
      children: [condition(), condition()],
    };
    expect(errorsOf(spec).join(" ")).toContain("unsatisfiable");
  });

  it("rejects ANY_N without requiredCount and WEIGHTED without threshold", () => {
    expect(
      errorsOf({ kind: "GROUP", rule: "ANY_N", children: [condition()] }).join(" ")
    ).toContain("requiredCount");
    expect(
      errorsOf({ kind: "GROUP", rule: "WEIGHTED", children: [condition({ weight: 2 })] }).join(" ")
    ).toContain("weightThreshold");
  });

  it("rejects an unsatisfiable WEIGHTED threshold", () => {
    const spec: GateNodeSpec = {
      kind: "GROUP",
      rule: "WEIGHTED",
      weightThreshold: 10,
      children: [condition({ weight: 3 }), condition({ weight: 2 })],
    };
    expect(errorsOf(spec).join(" ")).toContain("unsatisfiable");
  });

  it("rejects rule-mismatched fields (strict authoring hygiene)", () => {
    expect(
      errorsOf({ kind: "GROUP", rule: "ALL", requiredCount: 1, children: [condition()] }).join(" ")
    ).toContain("requiredCount is only valid on ANY_N");
    expect(
      errorsOf({ kind: "GROUP", rule: "ALL", children: [condition({ weight: 2 })] }).join(" ")
    ).toContain("weight is only valid inside a WEIGHTED");
  });

  it("rejects unregistered condition types - no verifier, no type", () => {
    const spec: GateNodeSpec = {
      kind: "GROUP",
      rule: "ALL",
      children: [condition({ conditionType: "NOT_REGISTERED" })],
    };
    expect(errorsOf(spec).join(" ")).toContain("not registered");
  });

  it("rejects a config that fails the condition's schema", () => {
    const spec: GateNodeSpec = {
      kind: "GROUP",
      rule: "ALL",
      children: [condition({ config: { v: "not-a-number" } })],
    };
    expect(errorsOf(spec).join(" ")).toContain("config is invalid");
  });
});
