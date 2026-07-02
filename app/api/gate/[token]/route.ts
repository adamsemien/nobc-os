/** Public guest gate traversal API (Stage 17, M2 guest render).
 *
 *  Capability-token surface: the GateSession token in the path is the only
 *  credential, and every read/write is scoped to that session's workspace.
 *  No Clerk session required - this is the anonymous guest door.
 *
 *  GET  -> the guest-safe view of the gate (never enums, never reasons).
 *  POST -> { action: "identify", email, name }  attach a guest member
 *          { action: "submit", nodeId, submission }  verify one condition
 *
 *  Fail-closed: unknown/expired tokens are 404; malformed bodies are 400
 *  with a generic guest-safe message; verifier internals never leak.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDefaultRegistry, getGateEngine } from "@/lib/gate-engine";
import {
  guestViewForSession,
  identifyGuestSession,
  loadGuestGateContext,
} from "@/lib/gate-engine/guest-session";

const UNAVAILABLE_BODY = { available: false as const };

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
]);

function deps() {
  return { db, engine: getGateEngine(), registry: getDefaultRegistry() };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
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

    // action === "submit"
    const context = await loadGuestGateContext(db, token);
    if (!context) return NextResponse.json(UNAVAILABLE_BODY, { status: 404 });
    if (!context.session.memberId) {
      return NextResponse.json(
        { available: false, error: "Tell us who you are first." },
        { status: 409 }
      );
    }
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
