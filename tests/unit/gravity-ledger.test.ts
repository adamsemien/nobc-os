/**
 * Gravity Ledger — demo data verification harness.
 *
 * Proves all three operator queues are populated with compelling, honest numbers
 * WITHOUT touching the database. Runs deriveMemberConnections() directly over
 * seed-shaped in-memory data that mirrors what seed-gravity-ledger.ts will write.
 *
 * Each test asserts:
 *   - The queue is non-empty.
 *   - The expected connectors appear with correct stuck counts and dollar figures.
 *   - The one-line evidence string reads believably.
 *
 * Dollar amounts: GRAVITY_AMOUNT_CENTS = 18_400 cents ($184/ticket).
 *   Stuck person (2 events):    2 × $184 = $368
 *   Not-stuck person (1 event): 1 × $184 = $184
 */
import { describe, it, expect } from 'vitest';
import {
  deriveMemberConnections,
  STUCK_MIN_EVENTS,
  type ConnectionRsvpRow,
  type ReferralEdge,
} from '@/lib/member-connections';
import {
  GRAVITY_AMOUNT_CENTS,
  deriveGravityQueues,
  formatGravityEvidence,
  type GravityMember,
} from '@/lib/dev/seed-gravity-ledger';

// ── Helpers ───────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws_test';
const EVT_SPRING = 'evt_spring';   // past ticketed — 21 days ago
const EVT_SUNDAY = 'evt_sunday';   // past free — 7 days ago
const EVT_UPCOMING = 'evt_upcoming'; // upcoming ticketed

const THIRTY_ONE_DAYS_AGO = new Date(Date.now() - 31 * 86_400_000);
const TWENTY_ONE_DAYS_AGO = new Date(Date.now() - 21 * 86_400_000);
const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 86_400_000);

function rsvp(over: Partial<ConnectionRsvpRow> & Pick<ConnectionRsvpRow, 'memberId' | 'eventId'>): ConnectionRsvpRow {
  return {
    checkedIn: true,
    checkedInAt: null,
    plusOneOfMemberId: null,
    paymentStatus: null,
    amountCents: null,
    ...over,
  };
}

function captured(opts: { memberId: string; eventId: string; plusOneOfMemberId?: string; at?: Date }): ConnectionRsvpRow {
  return rsvp({
    memberId: opts.memberId,
    eventId: opts.eventId,
    checkedIn: true,
    checkedInAt: opts.at ?? TWENTY_ONE_DAYS_AGO,
    paymentStatus: 'CAPTURED',
    amountCents: GRAVITY_AMOUNT_CENTS,
    plusOneOfMemberId: opts.plusOneOfMemberId ?? null,
  });
}

function attended(opts: { memberId: string; eventId: string; at?: Date }): ConnectionRsvpRow {
  return rsvp({
    memberId: opts.memberId,
    eventId: opts.eventId,
    checkedIn: true,
    checkedInAt: opts.at ?? SEVEN_DAYS_AGO,
  });
}

// ── Seed-shaped fixture ───────────────────────────────────────────────────

/**
 * Builds the full in-memory RSVP dataset + referral edges that mirror
 * what seed-gravity-ledger.ts writes to the DB.
 *
 * Connectors:
 *   daniela — EARNED A COMP  (4 brought, 3 stuck, $1,288 captured)
 *   marcus  — EARNED A COMP  (3 referred, 2 stuck, $920 captured; already on upcoming)
 *   priya   — WIN BACK       (2 brought, 2 stuck, $736 driven; last check-in 21d ago → quiet)
 *   sloane  — WIN BACK       (2 referred, 2 stuck, $736 driven; last check-in 21d ago → quiet)
 *   nathan  — GET IN ROOM    (2 brought, 2 stuck, $736 captured; NOT on upcoming)
 *   maya    — GET IN ROOM    (2 referred, 2 stuck, $736 captured; NOT on upcoming)
 */
function buildFixture() {
  // Member IDs
  const M = {
    daniela: 'daniela',
    marcus:  'marcus',
    priya:   'priya',
    sloane:  'sloane',
    nathan:  'nathan',
    maya:    'maya',
    // Brought/referred members
    p0: 'p0',  p1: 'p1',  p2: 'p2',  p3: 'p3',  // daniela's brought (p3 = not stuck)
    p10: 'p10', p11: 'p11', p12: 'p12',           // marcus' referred (p12 = not stuck)
    p20: 'p20', p21: 'p21',                        // priya's brought
    p22: 'p22', p23: 'p23',                        // sloane's referred
    p30: 'p30', p31: 'p31',                        // nathan's brought
    p40: 'p40', p41: 'p41',                        // maya's referred
  };

  const rsvps: ConnectionRsvpRow[] = [];

  // ── DANIELA (EARNED A COMP) ──────────────────────────────────────────────
  // Own check-ins (she's active, on upcoming).
  rsvps.push(captured({ memberId: M.daniela, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.daniela, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));
  rsvps.push(rsvp({ memberId: M.daniela, eventId: EVT_UPCOMING, checkedIn: false, checkedInAt: null }));

  // p0 — brought (plusOne), stuck (2 CAPTURED paid events → $368)
  rsvps.push(captured({ memberId: M.p0, eventId: EVT_SPRING, plusOneOfMemberId: M.daniela, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p0, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p1 — brought, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p1, eventId: EVT_SPRING, plusOneOfMemberId: M.daniela, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p1, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p2 — brought, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p2, eventId: EVT_SPRING, plusOneOfMemberId: M.daniela, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p2, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p3 — brought, NOT stuck (only 1 CAPTURED event → $184)
  rsvps.push(captured({ memberId: M.p3, eventId: EVT_SPRING, plusOneOfMemberId: M.daniela, at: TWENTY_ONE_DAYS_AGO }));

  // ── MARCUS (EARNED A COMP) ───────────────────────────────────────────────
  rsvps.push(captured({ memberId: M.marcus, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.marcus, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));
  rsvps.push(rsvp({ memberId: M.marcus, eventId: EVT_UPCOMING, checkedIn: false, checkedInAt: null }));

  // p10 — referred, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p10, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p10, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p11 — referred, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p11, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p11, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p12 — referred, NOT stuck (1 CAPTURED event → $184)
  rsvps.push(captured({ memberId: M.p12, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));

  // ── PRIYA (WIN BACK) ─────────────────────────────────────────────────────
  // Priya's OWN last check-in was 31+ days ago → she's quiet.
  rsvps.push(captured({ memberId: M.priya, eventId: EVT_SPRING, at: THIRTY_ONE_DAYS_AGO }));
  // Deliberately NOT added to EVT_SUNDAY or EVT_UPCOMING.

  // p20 — brought, stuck (2 CAPTURED events, her people still come → $368)
  rsvps.push(captured({ memberId: M.p20, eventId: EVT_SPRING, plusOneOfMemberId: M.priya, at: THIRTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p20, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p21 — brought, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p21, eventId: EVT_SPRING, plusOneOfMemberId: M.priya, at: THIRTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p21, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // ── SLOANE (WIN BACK) ────────────────────────────────────────────────────
  rsvps.push(captured({ memberId: M.sloane, eventId: EVT_SPRING, at: THIRTY_ONE_DAYS_AGO }));

  // p22 — referred, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p22, eventId: EVT_SPRING, at: THIRTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p22, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p23 — referred, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p23, eventId: EVT_SPRING, at: THIRTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p23, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // ── NATHAN (GET IN ROOM) ─────────────────────────────────────────────────
  rsvps.push(captured({ memberId: M.nathan, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.nathan, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));
  // Deliberately NOT on EVT_UPCOMING → get in room.

  // p30 — brought, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p30, eventId: EVT_SPRING, plusOneOfMemberId: M.nathan, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p30, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p31 — brought, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p31, eventId: EVT_SPRING, plusOneOfMemberId: M.nathan, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p31, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // ── MAYA (GET IN ROOM) ───────────────────────────────────────────────────
  rsvps.push(captured({ memberId: M.maya, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.maya, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));
  // Not on EVT_UPCOMING.

  // p40 — referred, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p40, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p40, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // p41 — referred, stuck (2 CAPTURED events → $368)
  rsvps.push(captured({ memberId: M.p41, eventId: EVT_SPRING, at: TWENTY_ONE_DAYS_AGO }));
  rsvps.push(captured({ memberId: M.p41, eventId: EVT_SUNDAY, at: SEVEN_DAYS_AGO }));

  // ── Referral edges ────────────────────────────────────────────────────────
  const referrals: ReferralEdge[] = [
    { memberId: M.p10, referredByMemberId: M.marcus },
    { memberId: M.p11, referredByMemberId: M.marcus },
    { memberId: M.p12, referredByMemberId: M.marcus },
    { memberId: M.p22, referredByMemberId: M.sloane },
    { memberId: M.p23, referredByMemberId: M.sloane },
    { memberId: M.p40, referredByMemberId: M.maya },
    { memberId: M.p41, referredByMemberId: M.maya },
    // Self-edges (no referrer — avoid undefined referredByMemberId noise)
    { memberId: M.daniela, referredByMemberId: null },
    { memberId: M.marcus,  referredByMemberId: null },
    { memberId: M.priya,   referredByMemberId: null },
    { memberId: M.sloane,  referredByMemberId: null },
    { memberId: M.nathan,  referredByMemberId: null },
    { memberId: M.maya,    referredByMemberId: null },
  ];

  // ── Members list (for deriveGravityQueues) ────────────────────────────────
  const members = Object.entries(M).map(([key, id]) => ({
    id,
    email: `${key}@test.dev`,
    firstName: key.charAt(0).toUpperCase() + key.slice(1),
    lastName: 'Test',
  }));

  return { M, rsvps, referrals, members };
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('Gravity Ledger — STUCK_MIN_EVENTS constant', () => {
  it('is 2 (engine definition — the demo depends on this)', () => {
    expect(STUCK_MIN_EVENTS).toBe(2);
  });
});

describe('Gravity Ledger — GRAVITY_AMOUNT_CENTS', () => {
  it('is $184 per ticket ($18,400 cents)', () => {
    expect(GRAVITY_AMOUNT_CENTS).toBe(18_400);
  });
});

// ── Queue 1: EARNED A COMP ─────────────────────────────────────────────────

describe('Queue 1 — EARNED A COMP (Daniela Reyes)', () => {
  const { M, rsvps, referrals } = buildFixture();

  it('returns 4 brought, 3 stuck', () => {
    const c = deriveMemberConnections(M.daniela, rsvps, referrals);
    expect(c.brought).toHaveLength(4);
    expect(c.broughtStuckCount).toBe(3);
  });

  it('p3 (brought once) is NOT stuck', () => {
    const c = deriveMemberConnections(M.daniela, rsvps, referrals);
    expect(c.brought.find((b) => b.memberId === M.p3)?.stuck).toBe(false);
  });

  it('p0, p1, p2 are stuck (2 check-ins each)', () => {
    const c = deriveMemberConnections(M.daniela, rsvps, referrals);
    for (const id of [M.p0, M.p1, M.p2]) {
      expect(c.brought.find((b) => b.memberId === id)?.stuck).toBe(true);
    }
  });

  it('broughtRevenueCents = 3 × 2 × $184 + 1 × $184 = $1,288 (128,800 cents)', () => {
    const c = deriveMemberConnections(M.daniela, rsvps, referrals);
    // p0: 2 CAPTURED events = 2 × 18400 = 36800
    // p1: 2 CAPTURED events = 36800
    // p2: 2 CAPTURED events = 36800
    // p3: 1 CAPTURED event  = 18400
    const expected = 3 * 2 * GRAVITY_AMOUNT_CENTS + 1 * GRAVITY_AMOUNT_CENTS;
    expect(c.broughtRevenueCents).toBe(expected); // 128800 = $1,288
    expect(c.broughtRevenueCents).toBe(128_800);
  });

  it('evidence string displays the $1,288 figure', () => {
    const { members } = buildFixture();
    const c = deriveMemberConnections(M.daniela, rsvps, referrals);
    const gm: GravityMember = {
      memberId: M.daniela,
      email: 'daniela@test.dev',
      firstName: 'Daniela',
      lastName: 'Reyes',
      connections: c,
    };
    const evidence = formatGravityEvidence(gm);
    expect(evidence).toContain('Brought 4');
    expect(evidence).toContain('3 of 4 now come on their own');
    expect(evidence).toContain('$1,288 captured');
  });
});

describe('Queue 1 — EARNED A COMP (Marcus Whitfield)', () => {
  const { M, rsvps, referrals } = buildFixture();

  it('returns 3 referred, 2 stuck', () => {
    const c = deriveMemberConnections(M.marcus, rsvps, referrals);
    expect(c.referred).toHaveLength(3);
    expect(c.referredStuckCount).toBe(2);
  });

  it('p12 (referred once) is NOT stuck', () => {
    const c = deriveMemberConnections(M.marcus, rsvps, referrals);
    expect(c.referred.find((b) => b.memberId === M.p12)?.stuck).toBe(false);
  });

  it('referredRevenueCents = 2 × 2 × $184 + 1 × $184 = $920 (92,000 cents)', () => {
    const c = deriveMemberConnections(M.marcus, rsvps, referrals);
    const expected = 2 * 2 * GRAVITY_AMOUNT_CENTS + 1 * GRAVITY_AMOUNT_CENTS;
    expect(c.referredRevenueCents).toBe(expected); // 92000 = $920
    expect(c.referredRevenueCents).toBe(92_000);
  });

  it('evidence string references referred + $920', () => {
    const c = deriveMemberConnections(M.marcus, rsvps, referrals);
    const gm: GravityMember = {
      memberId: M.marcus,
      email: 'marcus@test.dev',
      firstName: 'Marcus',
      lastName: 'Whitfield',
      connections: c,
    };
    const evidence = formatGravityEvidence(gm);
    expect(evidence).toContain('referred 3');
    expect(evidence).toContain('$920 captured');
  });
});

// ── Queue 2: WORTH WINNING BACK ───────────────────────────────────────────

describe('Queue 2 — WORTH WINNING BACK (Priya Anand)', () => {
  const { M, rsvps, referrals } = buildFixture();

  it('returns 2 brought, 2 stuck', () => {
    const c = deriveMemberConnections(M.priya, rsvps, referrals);
    expect(c.brought).toHaveLength(2);
    expect(c.broughtStuckCount).toBe(2);
  });

  it('broughtRevenueCents = 2 × 2 × $184 = $736 (73,600 cents)', () => {
    const c = deriveMemberConnections(M.priya, rsvps, referrals);
    expect(c.broughtRevenueCents).toBe(2 * 2 * GRAVITY_AMOUNT_CENTS); // 73600
    expect(c.broughtRevenueCents).toBe(73_600);
  });

  it('priya herself has no recent check-in (qualifies for win-back)', () => {
    // The win-back condition: last check-in > quietThresholdDays ago.
    // Priya's only RSVP with checkedIn=true is at THIRTY_ONE_DAYS_AGO.
    const priyaRsvps = rsvps.filter((r) => r.memberId === M.priya && r.checkedIn);
    expect(priyaRsvps.every((r) => r.checkedInAt! < new Date(Date.now() - 30 * 86_400_000))).toBe(true);
  });

  it('evidence string names her brought people and driven dollars', () => {
    const c = deriveMemberConnections(M.priya, rsvps, referrals);
    const gm: GravityMember = {
      memberId: M.priya,
      email: 'priya@test.dev',
      firstName: 'Priya',
      lastName: 'Anand',
      connections: c,
    };
    const evidence = formatGravityEvidence(gm);
    expect(evidence).toContain('Brought 2');
    expect(evidence).toContain('$736 captured');
  });
});

describe('Queue 2 — WORTH WINNING BACK (Sloane Whitaker)', () => {
  const { M, rsvps, referrals } = buildFixture();

  it('returns 2 referred, 2 stuck', () => {
    const c = deriveMemberConnections(M.sloane, rsvps, referrals);
    expect(c.referred).toHaveLength(2);
    expect(c.referredStuckCount).toBe(2);
  });

  it('referredRevenueCents = $736 (73,600 cents)', () => {
    const c = deriveMemberConnections(M.sloane, rsvps, referrals);
    expect(c.referredRevenueCents).toBe(73_600);
  });

  it('sloane has no recent check-in (qualifies for win-back)', () => {
    const sloaneRsvps = rsvps.filter((r) => r.memberId === M.sloane && r.checkedIn);
    expect(sloaneRsvps.every((r) => r.checkedInAt! < new Date(Date.now() - 30 * 86_400_000))).toBe(true);
  });
});

// ── Queue 3: GET IN ROOM ──────────────────────────────────────────────────

describe('Queue 3 — GET IN ROOM (Nathan Cho)', () => {
  const { M, rsvps, referrals } = buildFixture();

  it('returns 2 brought, 2 stuck', () => {
    const c = deriveMemberConnections(M.nathan, rsvps, referrals);
    expect(c.brought).toHaveLength(2);
    expect(c.broughtStuckCount).toBe(2);
  });

  it('broughtRevenueCents = $736 (73,600 cents)', () => {
    const c = deriveMemberConnections(M.nathan, rsvps, referrals);
    expect(c.broughtRevenueCents).toBe(73_600);
  });

  it('nathan has NO upcoming event RSVP (qualifies for get-in-room)', () => {
    const onUpcoming = rsvps.some((r) => r.memberId === M.nathan && r.eventId === EVT_UPCOMING);
    expect(onUpcoming).toBe(false);
  });

  it('nathan has recent check-ins (NOT in win-back)', () => {
    const recent = rsvps.filter(
      (r) => r.memberId === M.nathan && r.checkedIn && r.checkedInAt! > new Date(Date.now() - 30 * 86_400_000),
    );
    expect(recent.length).toBeGreaterThan(0);
  });
});

describe('Queue 3 — GET IN ROOM (Maya Goldberg)', () => {
  const { M, rsvps, referrals } = buildFixture();

  it('returns 2 referred, 2 stuck', () => {
    const c = deriveMemberConnections(M.maya, rsvps, referrals);
    expect(c.referred).toHaveLength(2);
    expect(c.referredStuckCount).toBe(2);
  });

  it('referredRevenueCents = $736 (73,600 cents)', () => {
    const c = deriveMemberConnections(M.maya, rsvps, referrals);
    expect(c.referredRevenueCents).toBe(73_600);
  });

  it('maya has NO upcoming RSVP (qualifies for get-in-room)', () => {
    const onUpcoming = rsvps.some((r) => r.memberId === M.maya && r.eventId === EVT_UPCOMING);
    expect(onUpcoming).toBe(false);
  });
});

// ── Full queue derivation ──────────────────────────────────────────────────

describe('deriveGravityQueues — all three queues populated', () => {
  const { M, rsvps, referrals, members } = buildFixture();

  const queues = deriveGravityQueues(members, rsvps, referrals, EVT_UPCOMING, 30);

  it('EARNED A COMP has ≥2 members', () => {
    expect(queues.earnedComp.length).toBeGreaterThanOrEqual(2);
  });

  it('WORTH WINNING BACK has ≥2 members', () => {
    expect(queues.winBack.length).toBeGreaterThanOrEqual(2);
  });

  it('GET IN ROOM has ≥2 members', () => {
    expect(queues.getInRoom.length).toBeGreaterThanOrEqual(2);
  });

  it('Daniela is in EARNED A COMP with the highest revenue', () => {
    const entry = queues.earnedComp.find((m) => m.memberId === M.daniela);
    expect(entry).toBeDefined();
    expect(entry!.connections.broughtRevenueCents).toBe(128_800);
    // She's first (sorted by revenue desc)
    expect(queues.earnedComp[0].memberId).toBe(M.daniela);
  });

  it('Marcus is in EARNED A COMP with $920 captured', () => {
    const entry = queues.earnedComp.find((m) => m.memberId === M.marcus);
    expect(entry).toBeDefined();
    expect(entry!.connections.referredRevenueCents).toBe(92_000);
  });

  it('Priya is in WIN BACK', () => {
    expect(queues.winBack.find((m) => m.memberId === M.priya)).toBeDefined();
  });

  it('Sloane is in WIN BACK', () => {
    expect(queues.winBack.find((m) => m.memberId === M.sloane)).toBeDefined();
  });

  it('Nathan is in GET IN ROOM', () => {
    expect(queues.getInRoom.find((m) => m.memberId === M.nathan)).toBeDefined();
  });

  it('Maya is in GET IN ROOM', () => {
    expect(queues.getInRoom.find((m) => m.memberId === M.maya)).toBeDefined();
  });

  it('nobody is in two queues at once', () => {
    const earnedIds = new Set(queues.earnedComp.map((m) => m.memberId));
    const winBackIds = new Set(queues.winBack.map((m) => m.memberId));
    const getInRoomIds = new Set(queues.getInRoom.map((m) => m.memberId));

    for (const id of earnedIds) {
      expect(winBackIds.has(id)).toBe(false);
      expect(getInRoomIds.has(id)).toBe(false);
    }
    for (const id of winBackIds) {
      expect(getInRoomIds.has(id)).toBe(false);
    }
  });

  it('EARNED A COMP is sorted by total revenue desc', () => {
    const revenues = queues.earnedComp.map(
      (m) => m.connections.broughtRevenueCents + m.connections.referredRevenueCents,
    );
    for (let i = 1; i < revenues.length; i++) {
      expect(revenues[i]).toBeLessThanOrEqual(revenues[i - 1]);
    }
  });
});

// ── Evidence string spot checks ───────────────────────────────────────────

describe('formatGravityEvidence — display copy', () => {
  const { M, rsvps, referrals } = buildFixture();

  it('Daniela: "Brought 4 as plus-ones; 3 of 4 now come on their own — $1,288 captured"', () => {
    const c = deriveMemberConnections(M.daniela, rsvps, referrals);
    const gm: GravityMember = {
      memberId: M.daniela, email: 'daniela@test.dev',
      firstName: 'Daniela', lastName: 'Reyes', connections: c,
    };
    const ev = formatGravityEvidence(gm);
    expect(ev).toMatch(/Brought 4 as plus-ones/);
    expect(ev).toMatch(/3 of 4 now come on their own/);
    expect(ev).toMatch(/\$1,288 captured/);
  });

  it('Marcus: "referred 3 members; 2 of 3 now come on their own — $920 captured"', () => {
    const c = deriveMemberConnections(M.marcus, rsvps, referrals);
    const gm: GravityMember = {
      memberId: M.marcus, email: 'marcus@test.dev',
      firstName: 'Marcus', lastName: 'Whitfield', connections: c,
    };
    const ev = formatGravityEvidence(gm);
    expect(ev).toMatch(/referred 3 members/);
    expect(ev).toMatch(/\$920 captured/);
  });

  it('Priya: "Brought 2 as plus-ones; 2 of 2 now come on their own — $736 captured"', () => {
    const c = deriveMemberConnections(M.priya, rsvps, referrals);
    const gm: GravityMember = {
      memberId: M.priya, email: 'priya@test.dev',
      firstName: 'Priya', lastName: 'Anand', connections: c,
    };
    const ev = formatGravityEvidence(gm);
    expect(ev).toMatch(/Brought 2 as plus-ones/);
    expect(ev).toMatch(/\$736 captured/);
  });
});
