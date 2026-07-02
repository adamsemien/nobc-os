/** Public guest gate traversal API (Stage 17, M2 guest render).
 *
 *  Capability-token surface: the GateSession token in the path is the only
 *  credential, and every read/write is scoped to that session's workspace.
 *  No Clerk session required - this is the anonymous guest door.
 *
 *  GET  -> the guest-safe view of the gate (never enums, never reasons).
 *  POST -> { action: "identify", email, name }  attach a guest member
 *          { action: "submit", nodeId, submission }  verify one condition
 *          { action: "check_application", nodeId }  the M4 bridge: the server
 *          finds the identified member's OWN application (never a
 *          client-supplied id) and runs the ANSWER_QUESTIONS verifier on it.
 *          { action: "redeem_comp", nodeId, code }  Phase A: a 100%-off
 *          PromoCode satisfies the PAY node with an honest COMP_CODE proof -
 *          zero Stripe contact, real Order + Ticket + door-list RSVP.
 *
 *  After every evaluated POST, the commerce bridge records money +
 *  attendance (Order/Ticket on satisfied PAY, confirmed RSVP on Open) - see
 *  lib/commerce/gate-bridge.ts. GET runs the same bridge when the gate is
 *  already open, so a crash between charge and record self-heals on reload.
 *
 *  Fail-closed: unknown/expired tokens are 404; malformed bodies are 400
 *  with a generic guest-safe message; verifier internals never leak. Both
 *  methods are rate limited per token+IP (M4-D8) - abuse gets a guest-safe
 *  429, never an error trace.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { bridgeGateAdmission } from "@/lib/commerce/gate-bridge";
import { checkCompCode, redeemCompCode } from "@/lib/commerce/promo-codes";
import { db } from "@/lib/db";
import { getDefaultRegistry, getGateEngine } from "@/lib/gate-engine";
import { findApplicationForMember } from "@/lib/gate-engine/application-bridge";
import {
  guestViewForSession,
  identifyGuestSession,
  loadGuestGateContext,
} from "@/lib/gate-engine/guest-session";
import type { GuestGateContext } from "@/lib/gate-engine/guest-session";
import type { GuestGateView } from "@/lib/gate-engine/guest-view";
import { CONDITION_ANSWER_QUESTIONS, CONDITION_PAY } from "@/lib/gate-engine/types";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

const UNAVAILABLE_BODY = { available: false as const };

// Per token+IP. POST is tighter because submissions run verifiers (including
// AI scoring). In-memory per instance - damping, not a shared quota.
const getLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const postLimiter = createRateLimiter({ limit: 12, windowMs: 60_000 });

function tooMany(retryAfter: number) {
  return NextResponse.json(
    { available: false, error: "Too many requests. Give it a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("identify"),
    email: z.string().email().max(320),
    name: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("submit"),
    nodeId: z.string().min(1).max(64),
    submission: z.unknown(),
  }),
  z.object({
    action: z.literal("check_application"),
    nodeId: z.string().min(1).max(64),
  }),
  z.object({
    action: z.literal("redeem_comp"),
    nodeId: z.string().min(1).max(64),
    code: z.string().min(1).max(80),
  }),
]);

function deps() {
  return { db, engine: getGateEngine(), registry: getDefaultRegistry() };
}

/** Money + attendance after an evaluation. Never affects the guest response. */
async function bridge(
  context: GuestGateContext,
  view: GuestGateView,
  submittedNodeId?: string,
): Promise<void> {
  await bridgeGateAdmission(db, {
    context,
    open: view.available ? view.open : false,
    submittedNodeId,
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const rateKey = `${token}:${clientIpFrom(req)}`;
  if (!getLimiter.allow(rateKey)) {
    return tooMany(getLimiter.retryAfterSeconds(rateKey));
  }
  const context = await loadGuestGateContext(db, token);
  if (!context) {
    return NextResponse.json(UNAVAILABLE_BODY, { status: 404 });
  }
  try {
    const view = await guestViewForSession(deps(), context);
    if (view.available && view.open) await bridge(context, view);
    return NextResponse.json(view, { status: view.available ? 200 : 404 });
  } catch (err) {
    console.error("[gate-guest-api] GET failed", {
      token: token.slice(0, 8),
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(UNAVAILABLE_BODY, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const rateKey = `${token}:${clientIpFrom(req)}`;
  if (!postLimiter.allow(rateKey)) {
    return tooMany(postLimiter.retryAfterSeconds(rateKey));
  }
  let parsed: z.infer<typeof postSchema>;
  try {
    parsed = postSchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { available: false, error: "That request could not be read." },
      { status: 400 }
    );
  }

  try {
    if (parsed.action === "identify") {
      const context = await identifyGuestSession(db, {
        token,
        email: parsed.email,
        name: parsed.name,
      });
      if (!context) return NextResponse.json(UNAVAILABLE_BODY, { status: 404 });
      const view = await guestViewForSession(deps(), context);
      // A returning member can open on carry-forward alone at identify time.
      await bridge(context, view);
      return NextResponse.json(view, { status: view.available ? 200 : 404 });
    }

    // "submit" and "check_application" both need an identified session.
    const context = await loadGuestGateContext(db, token);
    if (!context) return NextResponse.json(UNAVAILABLE_BODY, { status: 404 });
    if (!context.session.memberId) {
      return NextResponse.json(
        { available: false, error: "Tell us who you are first." },
        { status: 409 }
      );
    }

    if (parsed.action === "check_application") {
      // The bridge: server-resolved application, never a client-supplied id.
      const node = await db.gateNode.findFirst({
        where: {
          id: parsed.nodeId,
          gateId: context.session.gateId,
          workspaceId: context.session.workspaceId,
          conditionType: CONDITION_ANSWER_QUESTIONS,
        },
        select: { id: true },
      });
      const member = await db.member.findFirst({
        where: {
          id: context.session.memberId,
          workspaceId: context.session.workspaceId,
        },
        select: { id: true, email: true },
      });
      if (!node || !member) {
        return NextResponse.json(
          { available: false, error: "That request could not be read." },
          { status: 400 }
        );
      }
      const applicationId = await findApplicationForMember(db, {
        workspaceId: context.session.workspaceId,
        memberId: member.id,
        email: member.email,
      });
      if (!applicationId) {
        const view = await guestViewForSession(deps(), context);
        return NextResponse.json(
          {
            ...view,
            notice:
              "We could not find your application yet. Finish applying first, then check again.",
          },
          { status: view.available ? 200 : 404 }
        );
      }
      const view = await guestViewForSession(deps(), context, {
        submissions: { [node.id]: { applicationId } },
      });
      await bridge(context, view);
      return NextResponse.json(view, { status: view.available ? 200 : 404 });
    }

    if (parsed.action === "redeem_comp") {
      return redeemCompForSession(context, parsed.nodeId, parsed.code);
    }

    // action === "submit"
    const view = await guestViewForSession(deps(), context, {
      submissions: { [parsed.nodeId]: parsed.submission },
    });
    await bridge(context, view, parsed.nodeId);
    return NextResponse.json(view, { status: view.available ? 200 : 404 });
  } catch (err) {
    console.error("[gate-guest-api] POST failed", {
      token: token.slice(0, 8),
      action: parsed.action,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(UNAVAILABLE_BODY, { status: 500 });
  }
}

// One generic message for every comp failure - reasons never leak to guests.
const COMP_DECLINED = "That code did not work. Check it and try again.";

/** Phase A comp redemption: validate the code server-side, write the money +
 *  attendance records and the honest COMP_CODE proof, then re-evaluate. The
 *  fresh evaluation reads the SATISFIED proof (established truth) and the
 *  gate opens without any Stripe contact. */
async function redeemCompForSession(
  context: GuestGateContext,
  nodeId: string,
  code: string,
) {
  const { session, gate } = context;
  if (!session.memberId) {
    return NextResponse.json(
      { available: false, error: "Tell us who you are first." },
      { status: 409 }
    );
  }
  const declined = async () => {
    const view = await guestViewForSession(deps(), context);
    return NextResponse.json(
      view.available ? { ...view, notice: COMP_DECLINED } : view,
      { status: view.available ? 200 : 404 }
    );
  };

  if (gate.resourceType !== "EVENT") return declined();

  const node = await db.gateNode.findFirst({
    where: {
      id: nodeId,
      gateId: session.gateId,
      workspaceId: session.workspaceId,
      conditionType: CONDITION_PAY,
    },
    select: { id: true, config: true },
  });
  const member = await db.member.findFirst({
    where: { id: session.memberId, workspaceId: session.workspaceId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!node || !member) return declined();

  const def = getDefaultRegistry().get(CONDITION_PAY);
  const parsedConfig = def?.configSchema.safeParse(node.config ?? {});
  const priceCents =
    parsedConfig?.success &&
    typeof (parsedConfig.data as { priceCents?: unknown }).priceCents === "number"
      ? ((parsedConfig.data as { priceCents: number }).priceCents)
      : 0;
  if (priceCents <= 0) return declined();

  const check = await checkCompCode(db, {
    workspaceId: session.workspaceId,
    eventId: gate.resourceId,
    memberId: member.id,
    code,
  });
  if (!check.ok) return declined();

  await redeemCompCode(db, {
    workspaceId: session.workspaceId,
    eventId: gate.resourceId,
    member,
    promo: check.promo,
    payNodeId: node.id,
    subtotalCents: priceCents,
  });

  const view = await guestViewForSession(deps(), context);
  await bridge(context, view);
  return NextResponse.json(view, { status: view.available ? 200 : 404 });
}
