/** Public gate-session mint for an event (Stage 17, M4).
 *
 *  POST -> resolve the published event by slug (workspaceId server-derived,
 *  same F4 rule as every public route), find its gate, mint a GateSession,
 *  and 303 the guest to the walkthrough at /gate/[token].
 *
 *  GET mints NOTHING (M4-D7) - crawlers and link prefetchers GET; they are
 *  redirected back to the event page. Minting is rate limited per IP.
 */
import { NextResponse } from "next/server";
import { getGateEngine } from "@/lib/gate-engine";
import { resolvePublishedEventBySlug } from "@/lib/public-event-loader";
import { clientIpFrom, createRateLimiter } from "@/lib/rate-limit";

const mintLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  return NextResponse.redirect(new URL(`/e/${slug}`, req.url), 302);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const ip = clientIpFrom(req);
  if (!mintLimiter.allow(ip)) {
    return new NextResponse("Too many requests. Give it a moment and try again.", {
      status: 429,
      headers: { "Retry-After": String(mintLimiter.retryAfterSeconds(ip)) },
    });
  }

  const resolved = await resolvePublishedEventBySlug(slug);
  if (!resolved) return new NextResponse("Not found", { status: 404 });

  const engine = getGateEngine();
  const gate = await engine.getGateForResource({
    workspaceId: resolved.workspaceId,
    resource: { type: "EVENT", id: resolved.eventId },
  });
  if (!gate) return new NextResponse("Not found", { status: 404 });

  try {
    const session = await engine.createSession({
      workspaceId: resolved.workspaceId,
      gateId: gate.gateId,
    });
    return NextResponse.redirect(new URL(`/gate/${session.token}`, req.url), 303);
  } catch (err) {
    console.error("[gate-mint] session mint failed", {
      slug,
      workspaceId: resolved.workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Fail closed to the event page rather than a broken walkthrough.
    return NextResponse.redirect(new URL(`/e/${slug}`, req.url), 303);
  }
}
