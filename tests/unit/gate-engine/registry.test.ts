/** Registry invariants (Stage 17).
 *
 *  The hard invariant - "NO condition type is usable until its verifier
 *  exists and is tested" - is enforced structurally here: the default
 *  registry must contain exactly the five M1 types, every def must be
 *  contract-complete, tier + mechanism + carry-forward must match the locked
 *  table, and every guest prompt must pass brand law.
 */
import { describe, expect, it } from "vitest";
import { createDefaultConditionDefs } from "@/lib/gate-engine/conditions/defaults";
import { createConditionRegistry } from "@/lib/gate-engine/registry";
import type { CarryForwardPolicy, ConditionTypeDef } from "@/lib/gate-engine/types";

const EXPECTED: Record<
  string,
  {
    tier: string;
    mechanism: string;
    carry: CarryForwardPolicy;
    passive: boolean;
    exampleConfig: unknown;
  }
> = {
  PAY: {
    tier: "FIRST_PARTY",
    mechanism: "STRIPE_PAYMENT",
    carry: { kind: "NEVER" },
    passive: false,
    exampleConfig: { priceCents: 2500 },
  },
  ANSWER_QUESTIONS: {
    tier: "AI_ATTESTED",
    mechanism: "AI_SCORING",
    carry: { kind: "MONTHS", months: 12 },
    passive: false,
    exampleConfig: {},
  },
  REFERRED_BY_MEMBER: {
    tier: "FIRST_PARTY",
    mechanism: "INTERNAL_RECORD",
    carry: { kind: "ALWAYS" },
    passive: true,
    exampleConfig: {},
  },
  ATTENDED_PRIOR: {
    tier: "FIRST_PARTY",
    mechanism: "INTERNAL_RECORD",
    carry: { kind: "ALWAYS" },
    passive: true,
    exampleConfig: {},
  },
  HOLD_MEMBERSHIP: {
    tier: "FIRST_PARTY",
    mechanism: "INTERNAL_RECORD",
    carry: { kind: "LIVE" },
    passive: true,
    exampleConfig: {},
  },
};

describe("default condition registry", () => {
  const defs = createDefaultConditionDefs() as unknown as ConditionTypeDef<unknown>[];
  const registry = createConditionRegistry(defs);

  it("registers exactly the five M1 condition types", () => {
    expect(registry.types().sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("every def is contract-complete with the locked tier / mechanism / carry-forward", () => {
    for (const [type, expected] of Object.entries(EXPECTED)) {
      const def = registry.get(type);
      expect(def, `${type} must be registered`).not.toBeNull();
      expect(def!.verificationTier).toBe(expected.tier);
      expect(def!.proofMechanism).toBe(expected.mechanism);
      expect(def!.carryForward).toEqual(expected.carry);
      expect(def!.isPassive).toBe(expected.passive);
      expect(typeof def!.verify).toBe("function");
      const parsed = def!.configSchema.safeParse(expected.exampleConfig);
      expect(parsed.success, `${type} example config must parse`).toBe(true);
    }
  });

  it("every guest prompt passes brand law", () => {
    for (const [type, expected] of Object.entries(EXPECTED)) {
      const def = registry.get(type)!;
      const config = def.configSchema.parse(expected.exampleConfig);
      const prompt = def.guestPrompt(config);
      expect(prompt.length, `${type} prompt must not be empty`).toBeGreaterThan(0);
      expect(prompt, `${type}: "Access" not "RSVP"`).not.toMatch(/rsvp/i);
      expect(prompt, `${type}: "No Bad Company" never "NBC"`).not.toMatch(/\bNBC\b/);
      expect(prompt, `${type}: spaced hyphens, never em dashes`).not.toContain("—");
      expect(prompt, `${type}: no raw enum values in copy`).not.toMatch(
        /\b(ANY_N|WEIGHTED|TICKETED|CONDITION|GROUP|FIRST_PARTY|AI_ATTESTED|SATISFIED|REJECTED|PENDING_REVIEW)\b/
      );
    }
  });

  it("duplicate registration throws (authoring error, not grant path)", () => {
    const dup = registry.get("PAY")!;
    expect(() => registry.register(dup)).toThrow(/already registered/);
  });

  it("unknown types resolve to null and are absent from the type set", () => {
    expect(registry.get("NOT_A_TYPE")).toBeNull();
    expect(registry.typeSet().has("NOT_A_TYPE")).toBe(false);
  });
});
