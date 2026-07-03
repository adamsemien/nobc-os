/** Phase 0 baseline - pins the CURRENT render-path behavior for the No Bad
 *  Saturday event shape before the Event Builder Rebuild touches anything.
 *  Acceptance 8: this suite must pass identically at the end of every phase.
 *
 *  Pure-fixture layer (no DB): the v1 access pipeline the live /e/ page runs
 *  for the audit-documented NBS eventAccess JSON, the legacy-migration
 *  fallback pre-v3 rows rely on, and the active-event branch contract
 *  TemplateSplit derives (TemplateSplit.tsx:46-47). The DB-backed loader pin
 *  lives in nbs-render-baseline.db.test.ts.
 *
 *  If a change makes one of these assertions fail, the live NBS page renders
 *  differently - that is a cutover-only change and must move to Phase D.
 */
import { describe, expect, it, vi } from "vitest";

// event-access-submit reaches lib/db at module load; the functions under test
// here are pure, so stub the client boundary.
vi.mock("@/lib/db", () => ({ db: {} }));

import { ACTIVE_EVENT_ID } from "@/lib/active-event";
import {
  accessTypeLabel,
  buildSteps,
  deriveFlow,
  formatGateCTA,
  parseEventAccess,
  resolveAccessForViewer,
  resolveViewer,
} from "@/lib/event-access";
import { priceForResolved } from "@/lib/event-access-submit";
import { NBS_EVENT_ACCESS } from "./helpers/nbs-world";

describe("NBS render baseline (Phase 0 pin)", () => {
  it("pins the active-event id default the five import sites read", () => {
    // process.env.ACTIVE_EVENT_ID is unset in unit runs, so this pins the
    // hardcoded default - the July 11 event id.
    expect(ACTIVE_EVENT_ID).toBe("cmqr8wojk000004kzc90yxxy3");
  });

  it("parses the NBS eventAccess shape without falling back to defaults", () => {
    const access = parseEventAccess(NBS_EVENT_ACCESS);
    expect(access.guest.enabled).toBe(true);
    expect(access.guest.priceCents).toBe(2500);
    expect(access.guest.gates).toHaveLength(1);
    expect(access.guest.gates[0]).toMatchObject({
      type: "ticket",
      priceCents: 2500,
    });
    expect(access.member.enabled).toBe(true);
    expect(access.member.gates).toEqual([]);
    expect(access.comp.enabled).toBe(true);
  });

  it("anon viewer resolves to the guest lane: pay flow at 2500 cents", () => {
    const access = parseEventAccess(NBS_EVENT_ACCESS);
    expect(resolveViewer(null, null)).toBe("anon");
    const resolved = resolveAccessForViewer(access, "anon");
    expect(resolved).toMatchObject({ kind: "guest", priceCents: 2500 });
    if (resolved.kind === "closed") throw new Error("unreachable");
    expect(resolved.flow).toEqual(["pay"]);
    expect(deriveFlow(resolved.gates)).toEqual(["pay"]);
    // THE charge amount: priceForResolved reads the LANE price (2500),
    // not the gate's copy - the two-source drift the rebuild retires.
    expect(priceForResolved(resolved)).toBe(2500);
  });

  it("member viewer resolves to the member lane: free, auto-confirm", () => {
    const access = parseEventAccess(NBS_EVENT_ACCESS);
    const resolved = resolveAccessForViewer(access, "member");
    expect(resolved).toMatchObject({ kind: "member", priceCents: 0 });
    if (resolved.kind === "closed") throw new Error("unreachable");
    expect(resolved.flow).toEqual([]);
    expect(priceForResolved(resolved)).toBe(0);
    expect(formatGateCTA(resolved)).toBe("Reserve My Spot");
  });

  it("pins the anon guest CTA copy and steps the /e/ page renders", () => {
    const access = parseEventAccess(NBS_EVENT_ACCESS);
    const resolved = resolveAccessForViewer(access, "anon");
    if (resolved.kind === "closed") throw new Error("unreachable");
    expect(formatGateCTA(resolved)).toBe("Get Ticket - $25");
    expect(accessTypeLabel(resolved)).toBe("Ticketed");
    expect(buildSteps(resolved, "anon", [])).toEqual([
      "guestInfo",
      "pay",
      "submit",
    ]);
  });

  it("pins the TemplateSplit active-event branch contract", () => {
    // TemplateSplit.tsx:46-47 - full-poster contain + anon DoorFork only on
    // the active event. Derived here exactly as the component derives it.
    const branch = (eventId: string, viewer: string) => {
      const isActiveEvent = eventId === ACTIVE_EVENT_ID;
      return { isActiveEvent, showFork: isActiveEvent && viewer === "anon" };
    };
    expect(branch("cmqr8wojk000004kzc90yxxy3", "anon")).toEqual({
      isActiveEvent: true,
      showFork: true,
    });
    expect(branch("cmqr8wojk000004kzc90yxxy3", "member")).toEqual({
      isActiveEvent: true,
      showFork: false,
    });
    expect(branch("some-other-event", "anon")).toEqual({
      isActiveEvent: false,
      showFork: false,
    });
  });

  it("keeps the legacy gate-enum migration path alive for pre-v3 rows", () => {
    const legacy = {
      member: { enabled: true, gate: "questions_approval", priceCents: 0 },
      guest: { enabled: true, gate: "pay", priceCents: 2500 },
    };
    const access = parseEventAccess(legacy);
    const guest = resolveAccessForViewer(access, "anon");
    expect(guest).toMatchObject({ kind: "guest", priceCents: 2500 });
    if (guest.kind === "closed") throw new Error("unreachable");
    expect(guest.flow).toEqual(["pay"]);
    const member = resolveAccessForViewer(access, "member");
    if (member.kind === "closed") throw new Error("unreachable");
    expect(member.flow).toEqual(["fields", "approval"]);
  });

  it("falls back to safe defaults on junk, never throwing", () => {
    const access = parseEventAccess({ totally: "junk" });
    expect(access.member.enabled).toBe(true);
    expect(access.guest.enabled).toBe(false);
    // Junk shape = members-only: anons see the closed members-only state.
    const resolved = resolveAccessForViewer(access, "anon");
    expect(resolved.kind).toBe("closed");
  });
});
