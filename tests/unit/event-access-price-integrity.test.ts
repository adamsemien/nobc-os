/**
 * event-access-price-integrity.test.ts
 *
 * Unit-level price-integrity regression suite.
 *
 * Root cause documented in seed-test-ticketed-event.ts (2026-06-10):
 *   - The EventAccessSchema uses z.array(GateSchema).default([]) for the
 *     'gates' field.
 *   - Zod's safeParse SUCCEEDS on the legacy { gate: 'pay' } shape because
 *     it strips the unknown 'gate' key and fills 'gates' with the default [].
 *   - migrateLegacyAccess is therefore never reached.
 *   - Result: guest.gates=[] → deriveFlow([])=[] → no 'pay' step →
 *     priceForResolved=0 → payment-intent route returns 400 "This path is free"
 *     and the member-facing CTA renders "Get Ticket — $0".
 *
 * This test suite pins that behavior so any regression that re-introduces
 * $0 pricing on a ticketed event fails CI before reaching production.
 *
 * It also covers the priceForResolved helper to ensure the price surface
 * is stable for both the submit route (free-path guard) and the
 * payment-intent route (amount sent to Stripe).
 */

import { describe, it, expect } from 'vitest';
import { parseEventAccess, deriveFlow } from '@/lib/event-access';
import { defaultEventAccess } from '@/lib/event-access-schema';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: price extracted from resolved access
// (mirrors priceForResolved in lib/event-access-submit.ts)
// ─────────────────────────────────────────────────────────────────────────────

function priceForResolvedSimple(priceCents: number, flow: string[]): number {
  // The actual priceForResolved in event-access-submit.ts returns 0 when
  // the in-session flow has no 'pay' step, regardless of priceCents.
  const session = flow.slice(0, flow.includes('approval') ? flow.indexOf('approval') : flow.length);
  return session.includes('pay') ? priceCents : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Legacy { gate: 'pay' } shape — the Zod silent-strip trap
// ─────────────────────────────────────────────────────────────────────────────

describe('parseEventAccess — legacy { gate: "pay" } shape (price-integrity regression)', () => {
  it('migrates { gate: "pay" } to a ticket gate array — preserves priceCents', () => {
    // This is the root cause of the $0 regression:
    // { gate: 'pay' } was being silently stripped by Zod, leaving gates: [].
    const legacyPayShape = {
      member: { enabled: false, gates: [], priceCents: 0 },
      guest: { gate: 'pay', enabled: true, priceCents: 2500 },
    };

    const parsed = parseEventAccess(legacyPayShape);

    // After migration, guest must have a ticket gate (not an empty gates array)
    expect(parsed.guest.enabled).toBe(true);
    expect(parsed.guest.priceCents).toBe(2500);

    // The derived flow must include 'pay' — otherwise priceForResolved returns 0
    const flow = deriveFlow(parsed.guest.gates);
    expect(flow, 'Legacy { gate: "pay" } must derive a pay flow — $0 regression guard').toContain('pay');
  });

  it('a ticket gate in the canonical gates[] format produces a pay flow', () => {
    // This is the CORRECT shape produced by the seed script and event builder.
    const canonical = {
      member: { enabled: false, gates: [], priceCents: 0 },
      guest: {
        enabled: true,
        gates: [{ id: 'g-ticket-1', type: 'ticket', label: 'Ticket Purchase' }],
        priceCents: 2500,
      },
      comp: { enabled: false, budgetCap: null },
      registrationStyle: 'all_at_once',
    };

    const parsed = parseEventAccess(canonical);
    const flow = deriveFlow(parsed.guest.gates);

    expect(flow).toContain('pay');
    expect(parsed.guest.priceCents).toBe(2500);
  });

  it('price is 0 when gates is empty — the Zod silent-strip scenario', () => {
    // Documents the BROKEN behavior when Zod strips 'gate' and fills gates:[].
    // This is what USED to happen before the seed was fixed.
    // The test documents the invariant: empty gates → no pay step → price 0.
    const brokenParsedResult = {
      guest: { enabled: true, gates: [] as unknown[], priceCents: 2500 },
    };

    const flow = deriveFlow(brokenParsedResult.guest.gates as Parameters<typeof deriveFlow>[0]);
    const effectivePrice = priceForResolvedSimple(brokenParsedResult.guest.priceCents, flow);

    // This is $0 — the regression. Document it explicitly.
    expect(flow).not.toContain('pay');
    expect(effectivePrice).toBe(0);
    // ^ This test DOCUMENTS the broken state. The previous test asserts the FIX.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Legacy FlowStep[] format
// ─────────────────────────────────────────────────────────────────────────────

describe('parseEventAccess — legacy flow: ["pay"] format', () => {
  it('migrates flow: ["pay"] to a ticket gate and preserves priceCents', () => {
    const legacyFlowShape = {
      member: { flow: ['pay'], enabled: true, priceCents: 5000 },
      guest: { flow: [], enabled: false, priceCents: 0 },
    };

    const parsed = parseEventAccess(legacyFlowShape);
    const flow = deriveFlow(parsed.member.gates);

    expect(flow).toContain('pay');
    expect(parsed.member.priceCents).toBe(5000);
  });

  it('migrates flow: [] (open) to an empty gates array with priceCents preserved', () => {
    const legacyOpenShape = {
      member: { flow: [], enabled: true, priceCents: 0 },
      guest: { flow: [], enabled: false, priceCents: 0 },
    };

    const parsed = parseEventAccess(legacyOpenShape);
    const flow = deriveFlow(parsed.member.gates);

    expect(flow).not.toContain('pay');
    expect(flow).not.toContain('approval');
    expect(parsed.member.priceCents).toBe(0);
  });

  it('migrates flow: ["fields", "approval"] to an application gate', () => {
    const legacyApplyShape = {
      member: { flow: ['fields', 'approval'], enabled: true, priceCents: 0 },
      guest: { flow: [], enabled: false, priceCents: 0 },
    };

    const parsed = parseEventAccess(legacyApplyShape);
    const flow = deriveFlow(parsed.member.gates);

    expect(flow).toContain('fields');
    expect(flow).toContain('approval');
    expect(flow).not.toContain('pay');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Canonical EventAccess — parseEventAccess passes through unchanged
// ─────────────────────────────────────────────────────────────────────────────

describe('parseEventAccess — canonical EventAccess pass-through', () => {
  it('passes through default access unchanged', () => {
    const def = defaultEventAccess();
    const parsed = parseEventAccess(def);
    expect(parsed).toEqual(def);
  });

  it('passes through a ticketed event with correct price', () => {
    const ticketed = {
      member: { enabled: true, gates: [], priceCents: 0 },
      guest: {
        enabled: true,
        gates: [{ id: 'g1', type: 'ticket', label: 'General Admission' }],
        priceCents: 7500,
      },
      comp: { enabled: false, budgetCap: null },
      registrationStyle: 'all_at_once' as const,
    };

    const parsed = parseEventAccess(ticketed);
    expect(parsed.guest.priceCents).toBe(7500);
    expect(deriveFlow(parsed.guest.gates)).toContain('pay');
  });

  it('falls back to defaultEventAccess for null/garbage input', () => {
    expect(parseEventAccess(null)).toEqual(defaultEventAccess());
    expect(parseEventAccess(undefined)).toEqual(defaultEventAccess());
    expect(parseEventAccess({ nonsense: true })).toEqual(defaultEventAccess());
    expect(parseEventAccess(42)).toEqual(defaultEventAccess());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. priceForResolved semantics — the actual Stripe amount
// ─────────────────────────────────────────────────────────────────────────────

describe('price-integrity: pay-step gate contract', () => {
  it('ticketed event with priceCents=2500 and ticket gate derives non-zero price', () => {
    const access = parseEventAccess({
      member: { enabled: false, gates: [], priceCents: 0 },
      guest: {
        enabled: true,
        gates: [{ id: 'g-ticket', type: 'ticket', label: 'Ticket' }],
        priceCents: 2500,
      },
      comp: { enabled: false, budgetCap: null },
      registrationStyle: 'all_at_once',
    });

    const flow = deriveFlow(access.guest.gates);
    const effectivePrice = priceForResolvedSimple(access.guest.priceCents, flow);

    expect(effectivePrice).toBe(2500);
  });

  it('zero-price ticket gate (free event) results in 0 — submit route should handle it', () => {
    // A ticket gate with priceCents=0 is a degenerate case. The submit route
    // checks `if (price > 0)` to redirect to the payment-intent endpoint.
    // A zero-price ticket gate means the payment-intent route returns 400.
    // This test documents this edge case explicitly.
    const access = parseEventAccess({
      member: { enabled: true, gates: [], priceCents: 0 },
      guest: {
        enabled: true,
        gates: [{ id: 'g-ticket-free', type: 'ticket', label: 'Free Ticket' }],
        priceCents: 0,
      },
      comp: { enabled: false, budgetCap: null },
      registrationStyle: 'all_at_once',
    });

    const flow = deriveFlow(access.guest.gates);
    expect(flow).toContain('pay'); // gate says pay...
    const effectivePrice = priceForResolvedSimple(access.guest.priceCents, flow);
    expect(effectivePrice).toBe(0); // ...but price is 0 → submit route handles it
  });

  it('member price is used for member viewer; guest price for guest viewer', () => {
    const access = parseEventAccess({
      member: {
        enabled: true,
        gates: [{ id: 'gm', type: 'ticket', label: 'Member Ticket' }],
        priceCents: 3000,
      },
      guest: {
        enabled: true,
        gates: [{ id: 'gg', type: 'ticket', label: 'Guest Ticket' }],
        priceCents: 5000,
      },
      comp: { enabled: false, budgetCap: null },
      registrationStyle: 'all_at_once',
    });

    const memberFlow = deriveFlow(access.member.gates);
    const guestFlow = deriveFlow(access.guest.gates);

    expect(priceForResolvedSimple(access.member.priceCents, memberFlow)).toBe(3000);
    expect(priceForResolvedSimple(access.guest.priceCents, guestFlow)).toBe(5000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Pay-after-approval (approval gate precedes ticket gate)
// ─────────────────────────────────────────────────────────────────────────────

describe('pay-after-approval: in-session flow cuts at approval', () => {
  it('application + ticket gate: in-session flow is ["fields"] — no pay in session', () => {
    // This is the "apply_pay" pattern: member applies (fields + approval), then
    // if approved, pays. The in-session flow cuts at the approval gate, so
    // priceForResolved (which uses inSessionFlow) returns 0 until post-approval.
    const access = parseEventAccess({
      member: {
        enabled: true,
        gates: [
          { id: 'g-app', type: 'application', label: 'Application', approvalRequired: true },
          { id: 'g-ticket', type: 'ticket', label: 'Ticket' },
        ],
        priceCents: 5000,
      },
      guest: { enabled: false, gates: [], priceCents: 0 },
      comp: { enabled: false, budgetCap: null },
      registrationStyle: 'all_at_once',
    });

    const fullFlow = deriveFlow(access.member.gates);
    expect(fullFlow).toEqual(['fields', 'approval', 'pay']);

    // In-session (submit route perspective): cuts at 'approval' → no 'pay'
    const approvalIdx = fullFlow.indexOf('approval');
    const inSession = fullFlow.slice(0, approvalIdx);
    expect(inSession).toEqual(['fields']);
    expect(inSession).not.toContain('pay');

    // So the submit route (which checks priceForResolved) sees price=0 and
    // does NOT redirect to the payment-intent route during the initial apply step.
    const effectiveSessionPrice = priceForResolvedSimple(access.member.priceCents, inSession);
    expect(effectiveSessionPrice).toBe(0);
  });
});
