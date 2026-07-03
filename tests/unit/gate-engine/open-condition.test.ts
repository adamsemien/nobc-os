/** OPEN condition + canonical open-gate spec (Loose Ends L1) - pure tests.
 *
 *  The open door is a real registered condition, not an engine special case:
 *  the evaluator fail-closes empty groups by locked M1 decision, so "anyone
 *  can get in" is a passive verifier that always satisfies. These pins keep
 *  the contract honest - if OPEN ever grows knobs, review requirements, or a
 *  carried proof, these fail first.
 */
import { describe, expect, it } from "vitest";
import type { Member } from "@prisma/client";
import { createOpenCondition, type OpenConfig } from "@/lib/gate-engine/conditions/open";
import { createDefaultConditionDefs } from "@/lib/gate-engine/conditions/defaults";
import { createConditionRegistry } from "@/lib/gate-engine/registry";
import { validateGateSpec } from "@/lib/gate-engine/validate";
import {
  CONDITION_OPEN,
  isOpenSpec,
  openGateSpec,
  type VerifyArgs,
} from "@/lib/gate-engine/types";

const registry = () => createConditionRegistry(createDefaultConditionDefs());

function verifyArgs(overrides: Partial<Member> = {}): VerifyArgs<OpenConfig> {
  return {
    config: {},
    submission: undefined,
    member: {
      id: "member_open_test",
      workspaceId: "ws_open_test",
      status: "GUEST",
      approved: false,
      redListed: false,
      ...overrides,
    } as Member,
    workspaceId: "ws_open_test",
    resource: { type: "EVENT", id: "event_open_test" },
    nodeId: "node_open_test",
  };
}

describe("OPEN condition (L1)", () => {
  const def = createOpenCondition();

  it("is registered in the default registry", () => {
    expect(registry().has(CONDITION_OPEN)).toBe(true);
  });

  it("pins the honest contract: passive, LIVE, first-party internal record", () => {
    expect(def.type).toBe("OPEN");
    expect(def.isPassive).toBe(true);
    expect(def.carryForward).toEqual({ kind: "LIVE" });
    expect(def.verificationTier).toBe("FIRST_PARTY");
    expect(def.proofMechanism).toBe("INTERNAL_RECORD");
  });

  it("satisfies anyone - guest, member, even red-listed (ACCESS axis is the gate author's call)", async () => {
    await expect(def.verify(verifyArgs())).resolves.toMatchObject({
      outcome: "SATISFIED",
    });
    await expect(
      def.verify(verifyArgs({ status: "APPROVED", approved: true })),
    ).resolves.toMatchObject({ outcome: "SATISFIED" });
    await expect(
      def.verify(verifyArgs({ redListed: true })),
    ).resolves.toMatchObject({ outcome: "SATISFIED" });
  });

  it("has no knobs: empty config parses, anything else refuses", () => {
    expect(def.configSchema.safeParse({}).success).toBe(true);
    expect(def.configSchema.safeParse({ anything: 1 }).success).toBe(false);
  });
});

describe("openGateSpec + isOpenSpec (L1/L2)", () => {
  it("the canonical open gate validates against the default registry", () => {
    const result = validateGateSpec(openGateSpec(), registry());
    expect(result.valid).toBe(true);
  });

  it("mints a fresh object per call - no shared mutable spec", () => {
    expect(openGateSpec()).not.toBe(openGateSpec());
    expect(openGateSpec()).toEqual(openGateSpec());
  });

  it("isOpenSpec recognizes exactly the open shapes, fail-closed otherwise", () => {
    expect(isOpenSpec(openGateSpec())).toBe(true);
    expect(isOpenSpec(null)).toBe(false);
    // Childless groups are NOT open - the evaluator fail-closes them.
    expect(isOpenSpec({ kind: "GROUP", rule: "ALL", children: [] })).toBe(false);
    expect(
      isOpenSpec({
        kind: "GROUP",
        rule: "ALL",
        children: [
          { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } },
        ],
      }),
    ).toBe(false);
    // Mixed OPEN + a real requirement is a gate, not the open door.
    expect(
      isOpenSpec({
        kind: "GROUP",
        rule: "ALL",
        children: [
          { kind: "CONDITION", conditionType: CONDITION_OPEN, config: {} },
          { kind: "CONDITION", conditionType: "PAY", config: { priceCents: 2500 } },
        ],
      }),
    ).toBe(false);
  });
});
