import { describe, it, expect } from 'vitest';
import {
  resolveViewer,
  resolveAccessForViewer,
  deriveFlow,
  inSessionFlow,
  flowNeedsApproval,
  buildSteps,
  formatGateCTA,
  accessTypeLabel,
  parseEventAccess,
  type ResolvedAccess,
  type QuestionVisibility,
} from '@/lib/event-access';
import { deriveLegacyFromAccess } from '@/lib/event-access-derive';
import { defaultEventAccess, type EventAccess } from '@/lib/event-access-schema';
import type { Gate, GateType } from '@/lib/event-gates';
import { warmClosedCopy } from '@/app/m/events/[slug]/_components/event-format';

// The event-access gate is the eligibility + CTA decision layer for every event.
// It is pure (no I/O), so the decision table IS the contract. These tests also
// pin the LOCKED member-facing CTA copy (CLAUDE.md "Canonical Terminology") so a
// stray label change fails CI instead of shipping.

let _g = 0;
function gate(type: GateType, extra: Partial<Gate> = {}): Gate {
  _g += 1;
  return { id: `g${_g}`, type, label: type, ...extra };
}

function access(over: Partial<EventAccess> = {}): EventAccess {
  return { ...defaultEventAccess(), ...over };
}

describe('resolveViewer', () => {
  it('an APPROVED member is a member', () => {
    expect(resolveViewer({ status: 'APPROVED' }, 'user_1')).toBe('member');
  });
  it('a non-approved member row resolves to guest (present but not approved)', () => {
    expect(resolveViewer({ status: 'PENDING' }, null)).toBe('guest');
    expect(resolveViewer({ status: 'GUEST' }, 'user_1')).toBe('guest');
  });
  it('a signed-in user with no member row is a guest', () => {
    expect(resolveViewer(null, 'user_1')).toBe('guest');
  });
  it('nobody signed in is anon', () => {
    expect(resolveViewer(null, null)).toBe('anon');
  });
});

describe('deriveFlow (Gate[] -> ordered FlowStep[])', () => {
  it('no gates is an empty (auto-confirm) flow', () => {
    expect(deriveFlow([])).toEqual([]);
  });
  it('an application gate adds fields + approval by default', () => {
    expect(deriveFlow([gate('application')])).toEqual(['fields', 'approval']);
  });
  it('an application gate with approvalRequired:false adds fields only', () => {
    expect(deriveFlow([gate('application', { approvalRequired: false })])).toEqual(['fields']);
  });
  it('a ticket gate adds pay', () => {
    expect(deriveFlow([gate('ticket')])).toEqual(['pay']);
  });
  it('a waitlist gate adds approval', () => {
    expect(deriveFlow([gate('waitlist')])).toEqual(['approval']);
  });
  it('application + ticket orders fields, approval, then pay', () => {
    expect(deriveFlow([gate('application'), gate('ticket')])).toEqual(['fields', 'approval', 'pay']);
  });
  it('deduplicates repeated gate types', () => {
    expect(deriveFlow([gate('ticket'), gate('ticket')])).toEqual(['pay']);
  });
});

describe('inSessionFlow / flowNeedsApproval', () => {
  it('returns the whole flow when there is no approval gate', () => {
    expect(inSessionFlow(['fields', 'pay'])).toEqual(['fields', 'pay']);
  });
  it('cuts the flow at the first approval gate', () => {
    expect(inSessionFlow(['fields', 'approval', 'pay'])).toEqual(['fields']);
    expect(inSessionFlow(['approval'])).toEqual([]);
  });
  it('flowNeedsApproval reflects the approval step', () => {
    expect(flowNeedsApproval(['fields', 'approval'])).toBe(true);
    expect(flowNeedsApproval(['pay'])).toBe(false);
  });
});

describe('resolveAccessForViewer', () => {
  it('a member sees the member group when it is enabled', () => {
    const a = access({ member: { enabled: true, gates: [gate('ticket')], priceCents: 5000 } });
    const r = resolveAccessForViewer(a, 'member');
    expect(r.kind).toBe('member');
    if (r.kind === 'member') expect(r.priceCents).toBe(5000);
  });
  it('a member falls back to the guest group when member access is disabled', () => {
    const a = access({
      member: { enabled: false, gates: [], priceCents: 0 },
      guest: { enabled: true, gates: [gate('ticket')], priceCents: 2000 },
    });
    expect(resolveAccessForViewer(a, 'member').kind).toBe('guest');
  });
  it('closes for a member when neither group is enabled', () => {
    const a = access({ member: { enabled: false, gates: [], priceCents: 0 } });
    const r = resolveAccessForViewer(a, 'member');
    expect(r.kind).toBe('closed');
  });
  it('a guest/anon viewer gets the guest group when enabled', () => {
    const a = access({ guest: { enabled: true, gates: [], priceCents: 0 } });
    expect(resolveAccessForViewer(a, 'guest').kind).toBe('guest');
    expect(resolveAccessForViewer(a, 'anon').kind).toBe('guest');
  });
  it('a guest is closed-out (members only) when only the member group is enabled', () => {
    const a = access({ member: { enabled: true, gates: [], priceCents: 0 } });
    const r = resolveAccessForViewer(a, 'guest');
    expect(r.kind).toBe('closed');
    if (r.kind === 'closed') expect(r.reason).toMatch(/members only/i);
  });
});

const NO_QUESTIONS: QuestionVisibility[] = [];

function resolved(kind: 'member' | 'guest', flowGates: Gate[], priceCents = 0): ResolvedAccess {
  return { kind, gates: flowGates, flow: deriveFlow(flowGates), priceCents } as ResolvedAccess;
}

describe('buildSteps', () => {
  it('a closed resolution yields no steps', () => {
    expect(buildSteps({ kind: 'closed', reason: 'x' }, 'anon', NO_QUESTIONS)).toEqual([]);
  });
  it('an anon viewer on a member flow must auth first, then submit', () => {
    expect(buildSteps(resolved('member', []), 'anon', NO_QUESTIONS)).toEqual(['auth', 'submit']);
  });
  it('an anon viewer on a guest flow collects guest info first', () => {
    expect(buildSteps(resolved('guest', []), 'anon', NO_QUESTIONS)).toEqual(['guestInfo', 'submit']);
  });
  it('an already-signed-in member skips auth/guestInfo', () => {
    expect(buildSteps(resolved('member', []), 'member', NO_QUESTIONS)).toEqual(['submit']);
  });
  it('inserts a pay step for a ticket flow', () => {
    expect(buildSteps(resolved('member', [gate('ticket')]), 'member', NO_QUESTIONS)).toEqual([
      'pay',
      'submit',
    ]);
  });
  it('inserts fieldsBefore only when a question is visible to this viewer', () => {
    const flow = resolved('member', [gate('application', { approvalRequired: false })]);
    const visible: QuestionVisibility[] = [
      { whenInFlow: 'BEFORE_SUBMIT', showToMember: true, showToGuest: false },
    ];
    expect(buildSteps(flow, 'member', visible)).toEqual(['fieldsBefore', 'submit']);
    // same flow, but the only question is hidden from members -> no fieldsBefore
    const hidden: QuestionVisibility[] = [
      { whenInFlow: 'BEFORE_SUBMIT', showToMember: false, showToGuest: true },
    ];
    expect(buildSteps(flow, 'member', hidden)).toEqual(['submit']);
  });
});

describe('formatGateCTA (LOCKED member-facing copy)', () => {
  it('open member flow -> "Reserve My Spot"', () => {
    expect(formatGateCTA(resolved('member', []))).toBe('Reserve My Spot');
  });
  it('open guest flow -> "Register"', () => {
    expect(formatGateCTA(resolved('guest', []))).toBe('Register');
  });
  it('approval flow -> "Apply to Attend"', () => {
    expect(formatGateCTA(resolved('guest', [gate('application')]))).toBe('Apply to Attend');
  });
  it('ticket flow -> "Get Ticket - $X" with trimmed whole-dollar amounts', () => {
    expect(formatGateCTA(resolved('member', [gate('ticket')], 5000))).toBe('Get Ticket - $50');
    expect(formatGateCTA(resolved('member', [gate('ticket')], 4999))).toBe('Get Ticket - $49.99');
    expect(formatGateCTA(resolved('member', [gate('ticket')], 1050))).toBe('Get Ticket - $10.50');
  });
  it('pay-AFTER-approval shows "Apply to Attend" (pay is out of the in-session flow)', () => {
    // application (fields+approval) then ticket -> flow ['fields','approval','pay'];
    // inSessionFlow stops at approval, so pay is not in-session -> not a ticket CTA.
    const r = resolved('guest', [gate('application'), gate('ticket')]);
    expect(formatGateCTA(r)).toBe('Apply to Attend');
  });
  it('closed -> "Closed"', () => {
    expect(formatGateCTA({ kind: 'closed', reason: 'x' })).toBe('Closed');
  });
});

describe('accessTypeLabel (badge)', () => {
  it('labels by full flow, not in-session flow', () => {
    expect(accessTypeLabel(resolved('member', []))).toBe('Members');
    expect(accessTypeLabel(resolved('guest', []))).toBe('Open');
    expect(accessTypeLabel(resolved('guest', [gate('application')]))).toBe('Apply to Attend');
    expect(accessTypeLabel(resolved('member', [gate('ticket')], 100))).toBe('Ticketed');
    // pay-after-approval: badge is "Ticketed" even though the CTA is "Apply to Attend"
    expect(accessTypeLabel(resolved('guest', [gate('application'), gate('ticket')]))).toBe('Ticketed');
    expect(accessTypeLabel({ kind: 'closed', reason: 'x' })).toBe('Closed');
  });
});

describe('parseEventAccess', () => {
  it('passes a valid config through unchanged', () => {
    const a = access({ guest: { enabled: true, gates: [gate('ticket')], priceCents: 1500 } });
    expect(parseEventAccess(a)).toMatchObject({ guest: { enabled: true, priceCents: 1500 } });
  });
  it('falls back to the default for garbage input', () => {
    expect(parseEventAccess(null)).toEqual(defaultEventAccess());
    expect(parseEventAccess({ nonsense: true })).toEqual(defaultEventAccess());
  });
  it('migrates the legacy gate-enum format', () => {
    const legacy = {
      member: { gate: 'questions_approval', enabled: true, priceCents: 0 },
      guest: { gate: 'pay', enabled: true, priceCents: 1000 },
    };
    const parsed = parseEventAccess(legacy);
    expect(parsed.member.enabled).toBe(true);
    expect(parsed.guest.priceCents).toBe(1000);
    // member flow should require approval after migration
    expect(deriveFlow(parsed.member.gates)).toContain('approval');
    expect(deriveFlow(parsed.guest.gates)).toEqual(['pay']);
  });
  it('migrates the legacy FlowStep[] format', () => {
    const legacy = {
      member: { flow: ['pay'], enabled: true, priceCents: 5000 },
      guest: { flow: [], enabled: false, priceCents: 0 },
    };
    const parsed = parseEventAccess(legacy);
    expect(deriveFlow(parsed.member.gates)).toEqual(['pay']);
    expect(parsed.member.priceCents).toBe(5000);
    expect(parsed.guest.enabled).toBe(false);
  });
});

describe('deriveLegacyFromAccess (gate config -> legacy Event columns)', () => {
  it('default access derives an OPEN, no-approval, free event', () => {
    expect(deriveLegacyFromAccess(defaultEventAccess())).toEqual({
      accessMode: 'OPEN',
      approvalRequired: false,
      priceInCents: 0,
      nonMemberPriceInCents: null,
    });
  });
  it('a ticket gate makes it TICKETED without approval', () => {
    const a = access({ member: { enabled: true, gates: [gate('ticket')], priceCents: 5000 } });
    expect(deriveLegacyFromAccess(a)).toMatchObject({
      accessMode: 'TICKETED',
      approvalRequired: false,
      priceInCents: 5000,
    });
  });
  it('an application gate makes it TICKETED + approvalRequired', () => {
    const a = access({ member: { enabled: true, gates: [gate('application')], priceCents: 0 } });
    expect(deriveLegacyFromAccess(a)).toMatchObject({
      accessMode: 'TICKETED',
      approvalRequired: true,
    });
  });
  it('surfaces the guest (non-member) price when guest access is enabled', () => {
    const a = access({
      member: { enabled: true, gates: [gate('ticket')], priceCents: 5000 },
      guest: { enabled: true, gates: [gate('ticket')], priceCents: 8000 },
    });
    expect(deriveLegacyFromAccess(a).nonMemberPriceInCents).toBe(8000);
  });
});

describe('warmClosedCopy (past-event gate copy)', () => {
  it('past event: eyebrow is the canonical passed heading', () => {
    const copy = warmClosedCopy({ kind: 'closed', reason: 'This gathering has passed' });
    expect(copy.eyebrow).toBe('This gathering has passed');
  });
  it('past event: body thanks attendees and points to the calendar', () => {
    const copy = warmClosedCopy({ kind: 'closed', reason: 'This gathering has passed' });
    expect(copy.body).toMatch(/thanks to everyone who came/i);
    expect(copy.showApply).toBe(false);
  });
  it('members-only event: apply nudge is present', () => {
    const copy = warmClosedCopy({ kind: 'closed', reason: 'This event is open to members only.' });
    expect(copy.showApply).toBe(true);
    expect(copy.eyebrow).toBe('By membership');
  });
  it('generic closed event: no apply nudge', () => {
    const copy = warmClosedCopy({ kind: 'closed', reason: 'Access is not open at this time.' });
    expect(copy.showApply).toBe(false);
    expect(copy.eyebrow).toBe('By invitation');
  });
});
