import { describe, it, expect, vi, beforeEach } from "vitest";

// The confirm-before-create compose flow (ai-event-creation build). Pins the
// safety spine: proposeComposition persists NOTHING (the confirm-gate proof),
// only CORE fields (start, implied end, location, ambiguous access) raise
// questions, non-core fields never prompt, the plain-English access readout
// is exact, and executeComposition runs the action-layer calls in order only
// when invoked (i.e. after operator confirm).

const m = vi.hoisted(() => ({
  createEventDraft: vi.fn(),
  updateEventDetails: vi.fn(),
  setGateSpec: vi.fn(),
  setServiceFee: vi.fn(),
  createCompCode: vi.fn(),
}));
vi.mock("@/lib/builder/actions", () => m);

// Auth mocks for the server-action seam (compose-action.ts).
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "op1" })),
}));
vi.mock("@/lib/auth", () => ({
  getMemberWorkspaceId: vi.fn(async () => "w1"),
}));
vi.mock("@/lib/operator-role", () => ({
  getEffectiveRole: vi.fn(async () => "ADMIN"),
  roleAtLeast: () => true,
}));

import {
  accessReadout,
  composeEventFromPrompt,
  executeComposition,
  findCoreGaps,
  planToGateSpec,
  proposeComposition,
  titleEchoesLocation,
  type CompositionPlan,
  type GapProbe,
} from "@/lib/builder/compose";
import { confirmComposeAction } from "@/lib/builder/compose-action";

const basePlan: CompositionPlan = {
  title: "Pool Party",
  description: null,
  startAt: "2026-07-19T19:00:00.000Z",
  location: "Chateau Chloe",
  capacity: null,
  requiredAll: [],
  anyOneOf: [],
  serviceFeeMode: "absorb",
  compCode: null,
  assumptions: [],
};

const cleanProbe: GapProbe = {
  endImplied: false,
  endAt: null,
  accessAmbiguous: false,
};

// Every propose test injects all three ports (planner, prober, describer) so
// the suite never falls back to a default and touches the network.
const ports = (plan: CompositionPlan, probe: GapProbe = cleanProbe) => ({
  planner: async () => plan,
  gapProber: async () => probe,
  describer: async () => "Drafted.",
});

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.createEventDraft.mockResolvedValue({ ok: true, eventId: "e1", slug: "pool-party" });
  m.updateEventDetails.mockResolvedValue({ ok: true });
  m.setGateSpec.mockResolvedValue({ ok: true });
  m.setServiceFee.mockResolvedValue({ ok: true });
  m.createCompCode.mockResolvedValue({ ok: true });
});

describe("proposeComposition - the confirm-gate proof", () => {
  it("performs ZERO persistence: no draft, no details, no gate, no fee, no comp", async () => {
    const result = await proposeComposition("pool party sunday", ports(basePlan));
    expect(result.ok).toBe(true);
    expect(m.createEventDraft).not.toHaveBeenCalled();
    expect(m.updateEventDetails).not.toHaveBeenCalled();
    expect(m.setGateSpec).not.toHaveBeenCalled();
    expect(m.setServiceFee).not.toHaveBeenCalled();
    expect(m.createCompCode).not.toHaveBeenCalled();
  });

  it("injects today's date context and passes clarifications to re-extraction", async () => {
    let seen = "";
    await proposeComposition("pool party", {
      planner: async (p) => {
        seen = p;
        return basePlan;
      },
      gapProber: async () => cleanProbe,
      describer: async () => "Drafted.",
      clarifications: [{ question: "Where is it happening?", answer: "Chateau Chloe" }],
    });
    expect(seen).toContain("right now it is");
    expect(seen).toContain("Operator clarifications");
    expect(seen).toContain("A: Chateau Chloe");
  });

  it("normalizes an offset ISO start to Z-form (what the action layer accepts)", async () => {
    const result = await proposeComposition(
      "party",
      ports({ ...basePlan, startAt: "2026-07-19T19:00:00-05:00" }),
    );
    expect(result.ok && result.proposal.plan.startAt).toBe("2026-07-20T00:00:00.000Z");
  });

  it("an unparseable start becomes a gap question, not a post-confirm failure", async () => {
    const result = await proposeComposition(
      "party",
      ports({ ...basePlan, startAt: "whenever feels right" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.proposal.plan.startAt).toBeNull();
    expect(result.proposal.gaps.map((g) => g.field)).toContain("startAt");
  });

  it("fires the planner, the gap probe, and the describer concurrently", async () => {
    // The planner resolves only once BOTH sidecars have been invoked - under
    // any sequential flow (planner awaited to completion first) this
    // deadlocks; under the three-way allSettled it completes.
    let sidecarsSeen = 0;
    let releasePlan!: (p: CompositionPlan) => void;
    const sidecarRan = () => {
      sidecarsSeen += 1;
      if (sidecarsSeen === 2) releasePlan(basePlan);
    };
    const result = await proposeComposition("party", {
      planner: () =>
        new Promise<CompositionPlan>((resolve) => {
          releasePlan = resolve;
        }),
      gapProber: async () => {
        sidecarRan();
        return cleanProbe;
      },
      describer: async () => {
        sidecarRan();
        return "Drafted.";
      },
    });
    expect(result.ok).toBe(true);
  });

  it("a planner failure stays fatal even when the probe fulfills", async () => {
    const result = await proposeComposition("party", {
      planner: async () => {
        throw new Error("model down");
      },
      gapProber: async () => cleanProbe,
      describer: async () => "Drafted.",
    });
    expect(result).toEqual({
      ok: false,
      error: "Could not compose that - try rephrasing.",
    });
    expect(m.createEventDraft).not.toHaveBeenCalled();
  });

  it("a gap-probe failure degrades gracefully - plan gaps still computed", async () => {
    const result = await proposeComposition("party", {
      planner: async () => ({ ...basePlan, location: null }),
      gapProber: async () => {
        throw new Error("model down");
      },
      describer: async () => "Drafted.",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.proposal.gaps.map((g) => g.field)).toEqual(["location"]);
  });

  it("the describer fills a null description; the operator's words win over it", async () => {
    const filled = await proposeComposition("party", {
      ...ports(basePlan),
      describer: async () => "Low light, long tables, a night on its own clock.",
    });
    expect(filled.ok && filled.proposal.plan.description).toBe(
      "Low light, long tables, a night on its own clock.",
    );
    const dictated = await proposeComposition("party", {
      ...ports({ ...basePlan, description: "The operator wrote this." }),
      describer: async () => "Generated prose that must not win.",
    });
    expect(dictated.ok && dictated.proposal.plan.description).toBe(
      "The operator wrote this.",
    );
  });

  it("a describer failure degrades - description stays null, zero writes", async () => {
    const result = await proposeComposition("party", {
      ...ports(basePlan),
      describer: async () => {
        throw new Error("model down");
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.proposal.plan.description).toBeNull();
    expect(m.createEventDraft).not.toHaveBeenCalled();
  });

  it("flags titleFromLocation only when the derived title borrows the venue", async () => {
    const flagged = await proposeComposition(
      "party at chateau chloe",
      ports({ ...basePlan, title: "Party at Chateau Chloe" }),
    );
    expect(flagged.ok && flagged.proposal.titleFromLocation).toBe(true);
    // basePlan's "Pool Party" shares nothing with "Chateau Chloe".
    const clean = await proposeComposition("pool party", ports(basePlan));
    expect(clean.ok && clean.proposal.titleFromLocation).toBe(false);
  });
});

describe("titleEchoesLocation - the proper-noun-in-title caution", () => {
  it("flags a title that borrows the venue, whole or in part", () => {
    expect(titleEchoesLocation("Party at Chateau Chloe", "Chateau Chloe")).toBe(true);
    expect(titleEchoesLocation("Dinner at Sarah's", "Sarah's place")).toBe(true);
  });

  it("stays quiet when the title stands on its own", () => {
    expect(titleEchoesLocation("Pool Party", "Chateau Chloe")).toBe(false);
    expect(titleEchoesLocation("Late Night Dinner", null)).toBe(false);
    // Stopwords alone never trigger it.
    expect(titleEchoesLocation("Dinner at the Loft", "The Warehouse")).toBe(false);
  });
});

describe("findCoreGaps - locked decision 1", () => {
  it("missing start and location each raise exactly one targeted question", () => {
    const gaps = findCoreGaps({ ...basePlan, startAt: null, location: null }, cleanProbe);
    expect(gaps).toEqual([
      {
        field: "startAt",
        question: "When does it start? A date and a time - for example, Sunday July 19, 7pm.",
      },
      { field: "location", question: "Where is it happening?" },
    ]);
  });

  it("end prompts ONLY when implied and unresolved", () => {
    expect(
      findCoreGaps(basePlan, { ...cleanProbe, endImplied: true, endAt: null }).map((g) => g.field),
    ).toEqual(["endAt"]);
    // Implied AND resolved - no question.
    expect(
      findCoreGaps(basePlan, {
        ...cleanProbe,
        endImplied: true,
        endAt: "2026-07-19T23:00:00.000Z",
      }),
    ).toEqual([]);
    // Open-ended prompt - never invent an end.
    expect(findCoreGaps(basePlan, cleanProbe)).toEqual([]);
  });

  it("access prompts ONLY when ambiguous; a clear model never does", () => {
    expect(
      findCoreGaps(basePlan, { ...cleanProbe, accessAmbiguous: true }).map((g) => g.field),
    ).toEqual(["access"]);
    expect(
      findCoreGaps(
        { ...basePlan, anyOneOf: [{ kind: "pay", priceCents: 2500 }, { kind: "apply" }] },
        cleanProbe,
      ),
    ).toEqual([]);
  });

  it("non-core fields NEVER prompt - capacity and description missing raise nothing", () => {
    expect(
      findCoreGaps({ ...basePlan, capacity: null, description: null }, cleanProbe),
    ).toEqual([]);
  });
});

describe("accessReadout - the plain-English safety surface", () => {
  it('renders "$25 OR apply" exactly', () => {
    expect(
      accessReadout({
        ...basePlan,
        anyOneOf: [{ kind: "pay", priceCents: 2500 }, { kind: "apply" }],
      }),
    ).toEqual(["Any one way in: pay $25, or apply for consideration."]);
  });

  it("renders the open door", () => {
    expect(accessReadout(basePlan)).toEqual(["Open - anyone can get in."]);
  });

  it("a single alternative folds into the required line (mirrors planToGateSpec)", () => {
    expect(
      accessReadout({ ...basePlan, anyOneOf: [{ kind: "pay", priceCents: 2500 }] }),
    ).toEqual(["To attend, guests must pay $25."]);
  });

  it("combines required and alternatives; non-whole dollars keep cents", () => {
    expect(
      accessReadout({
        ...basePlan,
        requiredAll: [{ kind: "member" }],
        anyOneOf: [{ kind: "pay", priceCents: 2550 }, { kind: "referred" }],
      }),
    ).toEqual([
      "To attend, guests must hold a membership.",
      "Any one way in: pay $25.50, or be referred by a member.",
    ]);
  });
});

describe("executeComposition - runs only when called (after confirm)", () => {
  it("creates through the action layer in order, endAt passed through", async () => {
    const plan: CompositionPlan = {
      ...basePlan,
      description: "Cannonballs at sundown.",
      capacity: 60,
      anyOneOf: [{ kind: "pay", priceCents: 2500 }, { kind: "apply" }],
    };
    const result = await executeComposition(plan, { endAt: "2026-07-19T23:00:00.000Z" });
    expect(result.ok).toBe(true);
    expect(m.createEventDraft).toHaveBeenCalledWith({
      title: "Pool Party",
      startAt: "2026-07-19T19:00:00.000Z",
      location: "Chateau Chloe",
    });
    expect(m.updateEventDetails).toHaveBeenCalledWith("e1", {
      description: "Cannonballs at sundown.",
      capacity: 60,
      endAt: "2026-07-19T23:00:00.000Z",
    });
    expect(m.setGateSpec).toHaveBeenCalledWith("e1", planToGateSpec(plan));
    expect(m.setServiceFee).not.toHaveBeenCalled();
    expect(m.createCompCode).not.toHaveBeenCalled();
    const order = [
      m.createEventDraft.mock.invocationCallOrder[0],
      m.updateEventDetails.mock.invocationCallOrder[0],
      m.setGateSpec.mock.invocationCallOrder[0],
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("sets the fee and comp code only when the plan carries them", async () => {
    await executeComposition({
      ...basePlan,
      serviceFeeMode: "pass_stripe_only",
      compCode: "friends",
    });
    expect(m.setServiceFee).toHaveBeenCalledWith("e1", {
      mode: "pass_stripe_only",
      percentBps: null,
      flatCents: null,
    });
    expect(m.createCompCode).toHaveBeenCalledWith("e1", { code: "friends" });
  });
});

describe("confirmComposeAction - the server-side confirm seam", () => {
  it("a junk plan fails closed with zero writes", async () => {
    const result = await confirmComposeAction({ plan: { nonsense: true } });
    expect(result).toEqual({
      ok: false,
      error: "That plan could not be read - compose it again.",
    });
    expect(m.createEventDraft).not.toHaveBeenCalled();
  });

  it("a valid confirmed plan executes", async () => {
    const result = await confirmComposeAction({ plan: basePlan, endAt: null });
    expect(result.ok).toBe(true);
    expect(m.createEventDraft).toHaveBeenCalledTimes(1);
  });
});

describe("composeEventFromPrompt - the programmatic/test seam (unchanged)", () => {
  it("still composes a plan straight to rows through the action layer", async () => {
    const result = await composeEventFromPrompt("pool party", {
      planner: async () => basePlan,
    });
    expect(result.ok && result.eventId).toBe("e1");
    expect(m.setGateSpec).toHaveBeenCalledTimes(1);
  });
});
