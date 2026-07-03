/** M4 acceptance - application bridge + /e/ mint + rate limits on real rows
 *  against the confirmed dev branch (env-gated: GATE_M1_DB_TESTS=1).
 *
 *  The FROZEN scorer is mocked at the module boundary so no live AI call
 *  happens in tests (the verifier still runs its real ownership + workspace
 *  checks). Everything else - routes, engine, loaders - is real.
 */
import "./helpers/env";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { GateEngine } from "@/lib/gate-engine/orchestrate";
import { makeEvent, seedAcceptanceWorld, type AcceptanceWorld } from "./helpers/seed";

const RUN = process.env.GATE_M1_DB_TESTS === "1";
const describeDb = RUN ? describe : describe.skip;
const T = 90_000;

vi.mock("@/lib/scoring", () => ({
  scoreApplication: vi.fn(async (applicationId: string) => ({
    applicationId,
    archetype: "connector",
    memberWorthTotal: 82,
    aiRecommendation: "yes",
    reasoning: "m4 acceptance fixture",
    tags: [],
  })),
}));

type TokenCtx = { params: Promise<{ token: string }> };
type SlugCtx = { params: Promise<{ slug: string }> };
type PublicGateRoute = {
  GET: (req: Request, ctx: TokenCtx) => Promise<Response>;
  POST: (req: Request, ctx: TokenCtx) => Promise<Response>;
};
type MintRoute = {
  GET: (req: Request, ctx: SlugCtx) => Promise<Response>;
  POST: (req: Request, ctx: SlugCtx) => Promise<Response>;
};

let db: PrismaClient;
let engine: GateEngine;
let publicRoute: PublicGateRoute;
let mintRoute: MintRoute;
let assembleDTO: (slug: string) => Promise<{ gated?: boolean } | null>;
let world: AcceptanceWorld;
let gatedEventId: string;
let gateId: string;
let answersNodeId: string;
let referredNodeId: string;

const GATED_SLUG = "gate-m4-gated-event";
const UNGATED_SLUG = "gate-m4-ungated-event";

function tokenCtx(token: string): TokenCtx {
  return { params: Promise.resolve({ token }) };
}
function slugCtx(slug: string): SlugCtx {
  return { params: Promise.resolve({ slug }) };
}
function gatePost(token: string, body: unknown, ip = "10.0.0.1"): Request {
  return new Request(`http://localhost/api/gate/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}
function mintPost(slug: string, ip: string): Request {
  return new Request(`http://localhost/e/${slug}/access`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

async function identifiedSession(email: string): Promise<string> {
  const session = await engine.createSession({
    workspaceId: world.workspace.id,
    gateId,
  });
  const res = await publicRoute.POST(
    gatePost(session.token, { action: "identify", email, name: "Gate M4 guest" }),
    tokenCtx(session.token)
  );
  expect(res.status).toBe(200);
  return session.token;
}

describeDb("M4 flows (bridge + mint + limits on real rows)", () => {
  beforeAll(async () => {
    db = (await import("@/lib/db")).db;
    engine = (await import("@/lib/gate-engine")).getGateEngine();
    publicRoute = (await import(
      "@/app/api/gate/[token]/route"
    )) as unknown as PublicGateRoute;
    mintRoute = (await import("@/app/e/[slug]/access/route")) as unknown as MintRoute;
    assembleDTO = (await import("@/lib/public-event-loader")).assemblePublicEventDTO;

    world = await seedAcceptanceWorld(db, "gate-m4-flows");
    gatedEventId = await makeEvent(db, world.workspace.id, GATED_SLUG);
    await makeEvent(db, world.workspace.id, UNGATED_SLUG);

    const created = await engine.createGate({
      workspaceId: world.workspace.id,
      resource: { type: "EVENT", id: gatedEventId },
      name: "M4 door",
      spec: {
        kind: "GROUP",
        rule: "ANY_N",
        requiredCount: 1,
        children: [
          { kind: "CONDITION", conditionType: "ANSWER_QUESTIONS", config: {} },
          { kind: "CONDITION", conditionType: "REFERRED_BY_MEMBER", config: {} },
        ],
      },
    });
    gateId = created.gateId;
    const nodes = await db.gateNode.findMany({
      where: { gateId, kind: "CONDITION" },
      select: { id: true, conditionType: true },
    });
    answersNodeId = nodes.find((n) => n.conditionType === "ANSWER_QUESTIONS")!.id;
    referredNodeId = nodes.find((n) => n.conditionType === "REFERRED_BY_MEMBER")!.id;
  }, 180_000);

  it(
    "criterion 1: the bridge finds the guest's own application and satisfies the node",
    async () => {
      const token = await identifiedSession(world.applicant.email);
      const res = await publicRoute.POST(
        gatePost(token, { action: "check_application", nodeId: answersNodeId }),
        tokenCtx(token)
      );
      expect(res.status).toBe(200);
      const view = (await res.json()) as {
        available: boolean;
        open?: boolean;
        notice?: string;
      };
      expect(view.notice).toBeUndefined();
      expect(view.open).toBe(true); // ANY_N(1) satisfied by the scored application

      const proof = await db.gateProof.findFirst({
        where: { nodeId: answersNodeId, memberId: world.applicant.id },
      });
      expect(proof?.status).toBe("SATISFIED");
      expect((proof?.payload as { applicationId?: string })?.applicationId).toBe(
        world.applicationId
      );
    },
    T
  );

  it(
    "criterion 2: no application yet -> guest-safe notice, node stays unproven",
    async () => {
      const token = await identifiedSession(world.paidOnlyGuest.email);
      const res = await publicRoute.POST(
        gatePost(token, { action: "check_application", nodeId: answersNodeId }),
        tokenCtx(token)
      );
      expect(res.status).toBe(200);
      const view = (await res.json()) as { notice?: string };
      expect(view.notice).toContain("could not find your application");
      const proof = await db.gateProof.findFirst({
        where: { nodeId: answersNodeId, memberId: world.paidOnlyGuest.id },
      });
      expect(proof).toBeNull();

      // Targeting a non-application node is refused as unreadable.
      const wrong = await publicRoute.POST(
        gatePost(token, { action: "check_application", nodeId: referredNodeId }),
        tokenCtx(token)
      );
      expect(wrong.status).toBe(400);
    },
    T
  );

  it(
    "criterion 3: POST mint 303s to a working walkthrough; GET mints nothing; unknown slug 404s",
    async () => {
      const before = await db.gateSession.count({ where: { gateId } });
      const res = await mintRoute.POST(mintPost(GATED_SLUG, "10.1.0.1"), slugCtx(GATED_SLUG));
      expect(res.status).toBe(303);
      const location = res.headers.get("location")!;
      expect(location).toContain("/gate/");
      const token = location.split("/gate/")[1];
      const pub = await publicRoute.GET(
        new Request(`http://localhost/api/gate/${token}`, {
          headers: { "x-forwarded-for": "10.1.0.1" },
        }),
        tokenCtx(token)
      );
      expect(pub.status).toBe(200);

      const get = await mintRoute.GET(
        new Request(`http://localhost/e/${GATED_SLUG}/access`),
        slugCtx(GATED_SLUG)
      );
      expect(get.status).toBe(302);
      expect(get.headers.get("location")).toContain(`/e/${GATED_SLUG}`);
      expect(await db.gateSession.count({ where: { gateId } })).toBe(before + 1);

      const missing = await mintRoute.POST(
        mintPost("gate-m4-no-such-event", "10.1.0.2"),
        slugCtx("gate-m4-no-such-event")
      );
      expect(missing.status).toBe(404);

      // An ungated event 404s the mint too - the v1 door still owns it.
      const ungated = await mintRoute.POST(
        mintPost(UNGATED_SLUG, "10.1.0.3"),
        slugCtx(UNGATED_SLUG)
      );
      expect(ungated.status).toBe(404);
    },
    T
  );

  it(
    "criterion 4: the public DTO flags gated events and only gated events",
    async () => {
      const gated = await assembleDTO(GATED_SLUG);
      const ungated = await assembleDTO(UNGATED_SLUG);
      expect(gated?.gated).toBe(true);
      expect(ungated?.gated).toBe(false);
    },
    T
  );

  it(
    "criterion 5: the mint route rate limits per IP with Retry-After",
    async () => {
      const ip = "10.2.0.99";
      for (let i = 0; i < 10; i++) {
        const res = await mintRoute.POST(mintPost(GATED_SLUG, ip), slugCtx(GATED_SLUG));
        expect(res.status).toBe(303);
      }
      const blocked = await mintRoute.POST(mintPost(GATED_SLUG, ip), slugCtx(GATED_SLUG));
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    },
    T
  );
});
