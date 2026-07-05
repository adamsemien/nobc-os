/** Mass refund route - /api/operator/events/[id]/refund-all (Phase C,
 *  Decision 4a).
 *
 *  Contract: ADMIN-gated; dry-run returns count + remaining total and touches
 *  nothing; execute runs the shared per-refund machine row by row with
 *  failure isolation (row N failing never blocks row N+1); the audit row
 *  records attempted/succeeded/failed; unknown event 404s.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  eventFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  listRefundableRsvps: vi.fn(),
  refundRsvp: vi.fn(),
}));

vi.mock("@/lib/operator-role", () => ({ requirePermission: m.requirePermission }));
vi.mock("@/lib/db", () => ({
  db: {
    event: { findFirst: m.eventFindFirst },
    auditEvent: { create: m.auditCreate },
  },
}));
vi.mock("@/lib/commerce/refund", () => ({
  listRefundableRsvps: m.listRefundableRsvps,
  refundRsvp: m.refundRsvp,
  remainingRefundableCents: (r: { amountCents: number | null; refundAmountCents: number | null }) =>
    Math.max(0, (r.amountCents ?? 0) - (r.refundAmountCents ?? 0)),
}));

import { POST } from "@/app/api/operator/events/[id]/refund-all/route";

let eventSeq = 0;
const post = (body: unknown, eventId?: string) => {
  const id = eventId ?? `ev-${++eventSeq}`; // fresh id per call: fresh rate-limit bucket
  return POST(
    new Request("http://localhost/api/operator/events/x/refund-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) } as never,
  );
};

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.requirePermission.mockResolvedValue({ ok: true, userId: "u1", workspaceId: "w1", role: "ADMIN" });
  m.eventFindFirst.mockResolvedValue({ id: "ev1", title: "Gala" });
  m.auditCreate.mockResolvedValue({});
});

const row = (id: string, amountCents = 2606, refunded = 0) => ({
  id,
  eventId: "ev1",
  memberId: `m-${id}`,
  stripePaymentIntentId: `pi_${id}`,
  paymentStatus: "CAPTURED",
  refundedAt: null,
  amountCents,
  refundAmountCents: refunded,
});

describe("mass refund", () => {
  it("is ADMIN-gated", async () => {
    m.requirePermission.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
    const res = await post({ dryRun: true });
    expect(res.status).toBe(403);
    expect(m.listRefundableRsvps).not.toHaveBeenCalled();
  });

  it("dry run: count + remaining total, zero refund calls", async () => {
    m.listRefundableRsvps.mockResolvedValue([row("a"), row("b", 2606, 1000)]);
    const res = await post({ dryRun: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dryRun: true,
      refundableCount: 2,
      totalRemainingCents: 2606 + 1606,
    });
    expect(m.refundRsvp).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it("execute: every row runs the shared machine; a failure isolates", async () => {
    m.listRefundableRsvps.mockResolvedValue([row("a"), row("b"), row("c")]);
    m.refundRsvp
      .mockResolvedValueOnce({ ok: true, rsvpId: "a", thisRefundCents: 2606, cumulativeRefundCents: 2606, fully: true })
      .mockResolvedValueOnce({ ok: false, rsvpId: "b", status: 502, error: "Refund failed" })
      .mockResolvedValueOnce({ ok: true, rsvpId: "c", thisRefundCents: 2606, cumulativeRefundCents: 2606, fully: true });

    const res = await post({ dryRun: false });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ dryRun: false, attempted: 3, succeeded: 2, failed: 1 });
    expect(body.results).toEqual([
      { rsvpId: "a", ok: true, refundedCents: 2606 },
      { rsvpId: "b", ok: false, error: "Refund failed" },
      { rsvpId: "c", ok: true, refundedCents: 2606 },
    ]);
    // Full refunds only - the machine is never passed a partial amount.
    for (const call of m.refundRsvp.mock.calls) {
      expect(call[0]).toMatchObject({ workspaceId: "w1", actorId: "u1" });
      expect(call[0].amountCents).toBeUndefined();
    }
    expect(m.auditCreate).toHaveBeenCalledOnce();
    expect(m.auditCreate.mock.calls[0][0].data).toMatchObject({
      action: "event.mass_refund",
      metadata: { attempted: 3, succeeded: 2, failed: 1 },
    });
  });

  it("unknown event 404s before any refund work", async () => {
    m.eventFindFirst.mockResolvedValue(null);
    const res = await post({ dryRun: false });
    expect(res.status).toBe(404);
    expect(m.listRefundableRsvps).not.toHaveBeenCalled();
  });

  it("malformed body 400s", async () => {
    const res = await post({ nope: true });
    expect(res.status).toBe(400);
  });
});
