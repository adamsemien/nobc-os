import { describe, it, expect, vi } from 'vitest';
import {
  resolveViewer,
  resolveAccessForViewer,
  deriveFlow,
  inSessionFlow,
  parseEventAccess,
  type ResolvedAccess,
} from '@/lib/event-access';
import type { EventAccess, Gate } from '@/lib/event-access-schema';

// event-access decides WHO can attend and HOW MUCH they pay (overnight QA
// audit, CRITICAL #8). It is pure, deterministic, security/revenue-critical
// logic and was previously untested. No mocks needed for the pure module; the
// two below only neutralize import side-effects of event-access-submit (which
// pulls in db/clerk) so priceForResolved can be exercised in isolation.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
vi.mock('@/lib/member-qr', () => ({ generateMemberQrCode: () => 'qr' }));
import { priceForResolved } from '@/lib/event-access-submit';

const ticketGate = (priceCents = 0): Gate => ({ id: 'g-t', type: 'ticket', label: 'Ticket', priceCents });
const appGate = (approvalRequired = true): Gate => ({ id: 'g-a', type: 'application', label: 'Apply', approvalRequired });

function access(over: Partial<EventAccess> = {}): EventAccess {
  return {
    member: { enabled: true, gates: [], priceCents: 0 },
    guest: { enabled: false, gates: [], priceCents: 0 },
    comp: { enabled: false, budgetCap: null },
    registrationStyle: 'all_at_once',
    ...over,
  };
}

describe('resolveViewer', () => {
  it('maps identity to viewer kind', () => {
    expect(resolveViewer({ status: 'APPROVED' }, 'user_1')).toBe('member');
    expect(resolveViewer({ status: 'GUEST' }, 'user_1')).toBe('guest'); // logged-in non-member
    expect(resolveViewer(null, 'user_1')).toBe('guest'); // signed-in, no member row
    expect(resolveViewer(null, null)).toBe('anon');
  });
});

describe('resolveAccessForViewer truth table', () => {
  it('member on a member-enabled event gets member access + member price', () => {
    const a = access({ member: { enabled: true, gates: [], priceCents: 1000 } });
    const r = resolveAccessForViewer(a, 'member');
    expect(r.kind).toBe('member');
    expect(r.kind !== 'closed' && r.priceCents).toBe(1000);
  });

  it('member on a member-DISABLED, guest-enabled event falls through to GUEST price (regression)', () => {
    // The exact silent-fallthrough the audit flagged: a member must not be
    // charged the member price when only the guest gate is open.
    const a = access({
      member: { enabled: false, gates: [], priceCents: 1000 },
      guest: { enabled: true, gates: [ticketGate(2500)], priceCents: 2500 },
    });
    const r = resolveAccessForViewer(a, 'member');
    expect(r.kind).toBe('guest');
    expect(r.kind !== 'closed' && r.priceCents).toBe(2500);
  });

  it('guest/anon on a member-only event is closed', () => {
    const a = access({ member: { enabled: true, gates: [], priceCents: 0 }, guest: { enabled: false, gates: [], priceCents: 0 } });
    expect(resolveAccessForViewer(a, 'guest').kind).toBe('closed');
    expect(resolveAccessForViewer(a, 'anon').kind).toBe('closed');
  });

  it('both groups disabled is closed for everyone', () => {
    const a = access({ member: { enabled: false, gates: [], priceCents: 0 }, guest: { enabled: false, gates: [], priceCents: 0 } });
    expect(resolveAccessForViewer(a, 'member').kind).toBe('closed');
    expect(resolveAccessForViewer(a, 'guest').kind).toBe('closed');
    expect(resolveAccessForViewer(a, 'anon').kind).toBe('closed');
  });

  it('guest on a ticketed guest event gets a pay flow', () => {
    const a = access({ guest: { enabled: true, gates: [ticketGate(2000)], priceCents: 2000 } });
    const r = resolveAccessForViewer(a, 'guest');
    expect(r.kind).toBe('guest');
    expect(r.kind !== 'closed' && r.flow).toContain('pay');
  });

  it('apply-required event derives a fields+approval flow', () => {
    const a = access({ member: { enabled: true, gates: [appGate(true)], priceCents: 0 } });
    const r = resolveAccessForViewer(a, 'member');
    expect(r.kind !== 'closed' && r.flow).toEqual(['fields', 'approval']);
  });
});

describe('deriveFlow', () => {
  it('application without approval yields fields only; with approval adds approval', () => {
    expect(deriveFlow([appGate(false)])).toEqual(['fields']);
    expect(deriveFlow([appGate(true)])).toEqual(['fields', 'approval']);
  });
  it('ticket → pay; waitlist → approval', () => {
    expect(deriveFlow([ticketGate(500)])).toEqual(['pay']);
    expect(deriveFlow([{ id: 'g-w', type: 'waitlist', label: 'Waitlist' }])).toEqual(['approval']);
  });
});

describe('priceForResolved — only a pay BEFORE the first approval gate is charged', () => {
  const resolved = (gates: Gate[], priceCents: number): Extract<ResolvedAccess, { kind: 'guest' }> => ({
    kind: 'guest',
    gates,
    flow: deriveFlow(gates),
    priceCents,
  });

  it('charges up front when pay precedes approval', () => {
    // gates ticket → application(approval): flow [pay, fields, approval]; pay is in-session.
    const r = resolved([ticketGate(0), appGate(true)], 3000);
    expect(inSessionFlow(r.flow)).toContain('pay');
    expect(priceForResolved(r)).toBe(3000);
  });

  it('charges $0 up front when pay falls AFTER an approval gate (no pre-approval charge)', () => {
    // gates application(approval) → ticket: flow [fields, approval, pay]; pay is past the gate.
    const r = resolved([appGate(true), ticketGate(0)], 3000);
    expect(inSessionFlow(r.flow)).not.toContain('pay');
    expect(priceForResolved(r)).toBe(0);
  });
});

describe('parseEventAccess', () => {
  it('falls back to a valid default on garbage input', () => {
    const d = parseEventAccess({ totally: 'broken' });
    expect(d.member.enabled).toBe(true);
    expect(d.guest.enabled).toBe(false);
  });

  it('migrates the legacy gate-enum format to a valid schema', () => {
    const legacy = {
      member: { enabled: true, gate: 'questions_pay_approval', priceCents: 1500 },
      guest: { enabled: true, gate: 'apply_pay', priceCents: 1500 },
    };
    const parsed = parseEventAccess(legacy);
    expect(parsed.member.enabled).toBe(true);
    expect(parsed.guest.enabled).toBe(true);
    // questions_pay_approval → fields, pay, approval → gates application + ticket
    expect(parsed.member.gates.some((g) => g.type === 'application')).toBe(true);
    expect(parsed.member.gates.some((g) => g.type === 'ticket')).toBe(true);
  });

  it('migrates the legacy flow[] format to a valid schema', () => {
    const legacy = {
      member: { enabled: true, flow: ['fields', 'approval'], priceCents: 0 },
      guest: { enabled: false, flow: ['pay'], priceCents: 0 },
    };
    const parsed = parseEventAccess(legacy);
    expect(parsed.member.gates.some((g) => g.type === 'application')).toBe(true);
    expect(parsed.guest.gates.some((g) => g.type === 'ticket')).toBe(true);
  });
});
