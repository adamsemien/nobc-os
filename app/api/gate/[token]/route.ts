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
 *
 *  Fail-closed: unknown/expired tokens are 404; malformed bodies are 400
 *  with a generic guest-safe message; verifier internals never leak. Both
 *  methods are rate limited per token+IP (M4-D8) - abuse gets a guest-safe
 *  429, never an error trace.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDefaultRegistry, getGateEngine } from "@/lib/gate-engine";
import { findApplicationForMember } from "@/lib/gate-engine/application-bridge";
import {
  guestViewForSession,
  identifyGuestSession,
  loadGuestGateContext,
} from "@/lib/gate-engine/guest-session";
import { CONDITION_ANSWER_QUESTIONS } from "@/lib/gate-engine/types";
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
]);

function deps() {
  return { db, engine: getGateEngine(), registry: getDefaultRegistry() };
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
      return NextResponse.json(view, { status: view.available ? 200 : 404 });
    }

    // action === "submit"
    const view = await guestViewForSession(deps(), context, {
      submissions: { [parsed.nodeId]: parsed.submission },
    });
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
