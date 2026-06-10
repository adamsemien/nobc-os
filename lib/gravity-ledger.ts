/**
 * The Gravity Ledger — queue classification (demo centerpiece).
 *
 * Pure logic that turns a member's relationship graph (`lib/member-connections.ts`)
 * plus their own attendance into ONE of three operator action queues. No I/O here;
 * the page fetches rows, runs `deriveMemberConnections` per member, and feeds the
 * shape below in. Spec: `_context/16-member-intelligence/UI-GRAVITY-LEDGER.md`.
 *
 * Design law (from the falsification run, UI-GRAVITY-LEDGER §1): rank by CAPTURED
 * dollars driven, never a centrality score; every row ends in an action; a person
 * appears in exactly one queue (first match in EARNED_COMP → WIN_BACK → GET_IN_ROOM
 * order). Reach/`distinctCoAttendees` never enters this surface.
 */
import type { MemberConnections } from './member-connections';

export type GravityQueue = 'earned_comp' | 'win_back' | 'get_in_room';

/** Everything the classifier needs about one member. */
export interface GravityMemberInput {
  /** Edge/gravity facts from `deriveMemberConnections`. */
  connections: MemberConnections;
  /** The member's OWN most recent check-in (drives active vs lapsed). Null = never attended. */
  ownLastCheckInAt: Date | null;
  /** When we last comped this member, for the re-comp guard. Null = never comped. */
  lastCompedAt: Date | null;
  /** Already confirmed for the soonest published upcoming event? */
  confirmedForUpcoming: boolean;
}

/** Secondary gravity-bar gate: $500 of CAPTURED spend driven, in cents. */
export const GRAVITY_MIN_REVENUE_CENTS = 50_000;
/** Active/lapsed boundary, in days — mirrors `member-history` DEFAULT_SEGMENT_THRESHOLDS.lapsedAfterDays. */
export const ACTIVE_WINDOW_DAYS = 120;
/** EARNED A COMP excludes anyone comped within this many days (re-comp guard, decided §12.8). */
export const RECOMP_GUARD_DAYS = 90;
/** Honest attention cap per queue; the UI offers "Show all N". */
export const QUEUE_CAP = 8;

const DAY_MS = 86_400_000;
const daysBetween = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY_MS;

export const stuckEdges = (c: MemberConnections): number => c.broughtStuckCount + c.referredStuckCount;
export const dollarsDriven = (c: MemberConnections): number => c.broughtRevenueCents + c.referredRevenueCents;

/** The gravity bar: ≥1 stuck edge (primary) OR ≥ $500 driven (secondary). */
export function clearsGravityBar(c: MemberConnections): boolean {
  return stuckEdges(c) >= 1 || dollarsDriven(c) >= GRAVITY_MIN_REVENUE_CENTS;
}

/**
 * Which queue (if any) this member belongs in. First match wins; null = clears the
 * bar but there's nothing to do (e.g. active, recently comped, already on the list)
 * OR doesn't clear the bar at all.
 */
export function classifyGravityMember(input: GravityMemberInput, now: Date): GravityQueue | null {
  const { connections, ownLastCheckInAt, lastCompedAt, confirmedForUpcoming } = input;
  if (!clearsGravityBar(connections)) return null;

  const active = ownLastCheckInAt != null && daysBetween(now, ownLastCheckInAt) < ACTIVE_WINDOW_DAYS;
  const lapsed = ownLastCheckInAt != null && daysBetween(now, ownLastCheckInAt) >= ACTIVE_WINDOW_DAYS;
  const recentlyComped = lastCompedAt != null && daysBetween(now, lastCompedAt) < RECOMP_GUARD_DAYS;

  // 1. EARNED A COMP — proven pull, still showing up, not just comped.
  if (active && !recentlyComped) return 'earned_comp';
  // 2. WORTH WINNING BACK — their people still come, they've stopped.
  if (lapsed) return 'win_back';
  // 3. GET THEM IN THE ROOM — proven pull, no spot reserved yet.
  if (!confirmedForUpcoming) return 'get_in_room';
  return null;
}

export interface GravityRow {
  memberId: string;
  queue: GravityQueue;
  /** CAPTURED dollars driven through brought + referred people, in cents. */
  dollarsCents: number;
  /** Count of brought/referred people who stuck (≥2 own check-ins). */
  stuckEdges: number;
}

export interface GravityQueues {
  earned_comp: GravityRow[];
  win_back: GravityRow[];
  get_in_room: GravityRow[];
  /** False for all-free programming → UI hides $ figures and leads with stuck counts (§12.7). */
  workspaceHasRevenue: boolean;
}

/** Classify a workspace's members and bucket them into sorted queues. */
export function buildGravityQueues(
  members: Array<{ memberId: string } & GravityMemberInput>,
  now: Date,
): GravityQueues {
  const queues: GravityQueues = {
    earned_comp: [],
    win_back: [],
    get_in_room: [],
    workspaceHasRevenue: members.some((m) => dollarsDriven(m.connections) > 0),
  };

  for (const m of members) {
    const queue = classifyGravityMember(m, now);
    if (!queue) continue;
    queues[queue].push({
      memberId: m.memberId,
      queue,
      dollarsCents: dollarsDriven(m.connections),
      stuckEdges: stuckEdges(m.connections),
    });
  }

  // Sort each queue by dollars driven desc, ties broken by stuck count desc.
  const order = (a: GravityRow, b: GravityRow) =>
    b.dollarsCents - a.dollarsCents || b.stuckEdges - a.stuckEdges;
  queues.earned_comp.sort(order);
  queues.win_back.sort(order);
  queues.get_in_room.sort(order);
  return queues;
}
