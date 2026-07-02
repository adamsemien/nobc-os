/** COLLECT_INFO verifier (Event Builder Rebuild, Phase B - call C2). */
import { describe, expect, it } from "vitest";
import { createCollectInfoCondition } from "@/lib/gate-engine/conditions/collect-info";
import type { Member } from "@prisma/client";

const def = createCollectInfoCondition();
const member = { id: "m1" } as Member;
const resource = { type: "EVENT" as const, id: "ev1" };

const config = def.configSchema.parse({
  questions: [
    { id: "diet", label: "Any dietary notes?", type: "text", required: false },
    { id: "plus", label: "Bringing a guest?", type: "checkbox", required: true },
  ],
});

const verify = (submission: unknown) =>
  def.verify({ config, submission, member, workspaceId: "w1", resource });

describe("COLLECT_INFO", () => {
  it("is stamped honestly: first-party internal record, never AI", () => {
    expect(def.verificationTier).toBe("FIRST_PARTY");
    expect(def.proofMechanism).toBe("INTERNAL_RECORD");
    expect(def.carryForward).toEqual({ kind: "NEVER" });
  });

  it("satisfies when every required question is answered", async () => {
    const result = await verify({ answers: { diet: "none", plus: true } });
    expect(result.outcome).toBe("SATISFIED");
    expect(result.payload).toMatchObject({
      answers: { diet: "none", plus: true },
    });
    expect(
      (result.payload as { questions: { id: string; label: string }[] }).questions,
    ).toEqual([
      { id: "diet", label: "Any dietary notes?" },
      { id: "plus", label: "Bringing a guest?" },
    ]);
  });

  it("optional questions may stay blank", async () => {
    const result = await verify({ answers: { plus: true } });
    expect(result.outcome).toBe("SATISFIED");
  });

  it("rejects when a required answer is missing, blank, or unchecked", async () => {
    expect((await verify({ answers: {} })).outcome).toBe("REJECTED");
    expect((await verify({ answers: { plus: false } })).outcome).toBe("REJECTED");
    expect((await verify({ answers: { plus: "" } })).outcome).toBe("REJECTED");
  });

  it("drops answers to questions the operator never asked", async () => {
    const result = await verify({
      answers: { plus: true, injected: "<script>alert(1)</script>" },
    });
    expect(result.outcome).toBe("SATISFIED");
    expect(
      (result.payload as { answers: Record<string, unknown> }).answers,
    ).not.toHaveProperty("injected");
  });

  it("rejects an unreadable submission without throwing", async () => {
    expect((await verify("junk")).outcome).toBe("REJECTED");
    expect((await verify(null)).outcome).toBe("REJECTED");
  });

  it("config law: at least one question, capped fields", () => {
    expect(def.configSchema.safeParse({ questions: [] }).success).toBe(false);
    expect(
      def.configSchema.safeParse({
        questions: [{ id: "q", label: "One?", type: "select", options: ["A", "B"] }],
      }).success,
    ).toBe(true);
  });
});
