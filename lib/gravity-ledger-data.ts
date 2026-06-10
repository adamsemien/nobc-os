/**
 * Gravity Ledger — server data assembly (impl layer; the pure rules live in
 * `lib/gravity-ledger.ts`, the edges in `lib/member-connections.ts`).
 *
 * Fetches a workspace's rows once, derives each connector's graph, classifies them
 * into the three action queues, and enriches each into a render-ready row with its
 * provable receipts. Workspace-scoped on every query (the security boundary).
 */
import { db } from './db';
import { deriveMemberConnections, type ConnectionRsvpRow, type ReferralEdge, type MemberConnections } from './member-connections';
import { buildGravityQueues, type GravityQueue } from './gravity-ledger';

export interface LedgerReceipt {
  memberId: string;
  name: string;
  edge: 'plus-one' | 'referred';
  originEvent: string | null;
  checkIns: number;
  spendCents: number;
  stuck: boolean;
}

export interface LedgerRow {
  memberId: string;
  name: string;
  email: string;
  hasPhone: boolean;
  dollarsCents: number;
  broughtCount: number;
  broughtStuck: number;
  referredCount: number;
  referredStuck: number;
  lastCheckInAt: Date | null;
  receipts: LedgerReceipt[];
}

export interface LedgerView {
  queues: Record<GravityQueue, LedgerRow[]>;
  workspaceHasRevenue: boolean;
  upcoming: { id: string; title: string; slug: string } | null;
  /** True when no member clears the gravity bar but edges exist → "Pull is forming". */
  hasEdgesButNoneCleared: boolean;
}

const nameOf = (m: { firstName: string | null; lastName: string | null; email: string }) =>
  `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.email;

export async function getGravityLedger(workspaceId: string, now = new Date()): Promise<LedgerView> {
  const [members, rsvps, events, upcoming] = await Promise.all([
    db.member.findMany({
      where: { workspaceId, mergedIntoId: null },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, referredByMemberId: true },
    }),
    db.rSVP.findMany({
      where: { workspaceId },
      select: {
        memberId: true, eventId: true, checkedIn: true, checkedInAt: true,
        plusOneOfMemberId: true, paymentStatus: true, amountCents: true,
        isComp: true, status: true, createdAt: true,
      },
    }),
    db.event.findMany({ where: { workspaceId }, select: { id: true, title: true } }),
    db.event.findFirst({
      where: { workspaceId, status: 'PUBLISHED', startAt: { gt: now } },
      orderBy: { startAt: 'asc' },
      select: { id: true, title: true, slug: true },
    }),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const eventTitleById = new Map(events.map((e) => [e.id, e.title]));

  // Per-member rollups computed once from the row set.
  const checkInsByMember = new Map<string, number>();
  const lastCheckInByMember = new Map<string, Date>();
  const lastCompedByMember = new Map<string, Date>();
  const confirmedUpcoming = new Set<string>();
  const broughtOrigin = new Map<string, string>(); // `${target}|${brought}` -> eventId

  for (const r of rsvps) {
    if (r.checkedIn) {
      checkInsByMember.set(r.memberId, (checkInsByMember.get(r.memberId) ?? 0) + 1);
      if (r.checkedInAt) {
        const prev = lastCheckInByMember.get(r.memberId);
        if (!prev || r.checkedInAt > prev) lastCheckInByMember.set(r.memberId, r.checkedInAt);
      }
    }
    if (r.isComp) {
      const prev = lastCompedByMember.get(r.memberId);
      if (!prev || r.createdAt > prev) lastCompedByMember.set(r.memberId, r.createdAt);
    }
    if (upcoming && r.eventId === upcoming.id && r.status === 'CONFIRMED') confirmedUpcoming.add(r.memberId);
    if (r.plusOneOfMemberId) broughtOrigin.set(`${r.plusOneOfMemberId}|${r.memberId}`, r.eventId);
  }

  const connRows: ConnectionRsvpRow[] = rsvps.map((r) => ({
    memberId: r.memberId, eventId: r.eventId, checkedIn: r.checkedIn,
    checkedInAt: r.checkedInAt, plusOneOfMemberId: r.plusOneOfMemberId,
    paymentStatus: r.paymentStatus, amountCents: r.amountCents,
  }));
  const referralEdges: ReferralEdge[] = members.map((m) => ({ memberId: m.id, referredByMemberId: m.referredByMemberId }));

  // Candidates = anyone with at least one outbound edge (brought or referred someone).
  const candidates = new Set<string>();
  for (const r of rsvps) if (r.plusOneOfMemberId) candidates.add(r.plusOneOfMemberId);
  for (const m of members) if (m.referredByMemberId) candidates.add(m.referredByMemberId);

  const connById = new Map<string, MemberConnections>();
  const inputs = [...candidates]
    .filter((id) => memberById.has(id))
    .map((id) => {
      const connections = deriveMemberConnections(id, connRows, referralEdges);
      connById.set(id, connections);
      return {
        memberId: id,
        connections,
        ownLastCheckInAt: lastCheckInByMember.get(id) ?? null,
        lastCompedAt: lastCompedByMember.get(id) ?? null,
        confirmedForUpcoming: confirmedUpcoming.has(id),
      };
    });

  const bucketed = buildGravityQueues(inputs, now);

  const toRow = (memberId: string): LedgerRow => {
    const m = memberById.get(memberId)!;
    const c = connById.get(memberId)!;
    const receipts: LedgerReceipt[] = [
      ...c.brought.map((b): LedgerReceipt => ({
        memberId: b.memberId,
        name: memberById.has(b.memberId) ? nameOf(memberById.get(b.memberId)!) : 'Guest',
        edge: 'plus-one',
        originEvent: eventTitleById.get(broughtOrigin.get(`${memberId}|${b.memberId}`) ?? '') ?? null,
        checkIns: checkInsByMember.get(b.memberId) ?? 0,
        spendCents: b.spendCents,
        stuck: b.stuck,
      })),
      ...c.referred.map((r): LedgerReceipt => ({
        memberId: r.memberId,
        name: memberById.has(r.memberId) ? nameOf(memberById.get(r.memberId)!) : 'Guest',
        edge: 'referred',
        originEvent: null,
        checkIns: checkInsByMember.get(r.memberId) ?? 0,
        spendCents: r.spendCents,
        stuck: r.stuck,
      })),
    ].sort((a, b) => b.spendCents - a.spendCents);

    return {
      memberId,
      name: nameOf(m),
      email: m.email,
      hasPhone: Boolean(m.phone),
      dollarsCents: c.broughtRevenueCents + c.referredRevenueCents,
      broughtCount: c.brought.length,
      broughtStuck: c.broughtStuckCount,
      referredCount: c.referred.length,
      referredStuck: c.referredStuckCount,
      lastCheckInAt: lastCheckInByMember.get(memberId) ?? null,
      receipts,
    };
  };

  const queues = {
    earned_comp: bucketed.earned_comp.map((r) => toRow(r.memberId)),
    win_back: bucketed.win_back.map((r) => toRow(r.memberId)),
    get_in_room: bucketed.get_in_room.map((r) => toRow(r.memberId)),
  };

  const totalCleared = queues.earned_comp.length + queues.win_back.length + queues.get_in_room.length;

  return {
    queues,
    workspaceHasRevenue: bucketed.workspaceHasRevenue,
    upcoming,
    hasEdgesButNoneCleared: totalCleared === 0 && candidates.size > 0,
  };
}
