/**
 * CRM S-slice — Member Connections
 *
 * Adapts lib/member-connections.ts output to the MemberConnections contract
 * the route and Prism consume. Pure derivation; no I/O here — callers provide
 * the rows. The route owns the workspace-scoped DB fetches.
 *
 * Scope: referral edges (referredByMemberId both directions) only for the
 * S-slice. Plus-one edges require plusOneOfMemberId (already in schema, see
 * ConnectionRsvpRow). Co-attendance ranking is available but not exposed in
 * the S-slice contract — the flat `connections[]` shape is what Prism builds
 * against; richer edges land in the L-slice when MemberRelationship migrates.
 *
 * Workspace scoping: all DB fetches are done by the route with server-derived
 * workspaceId. getMemberConnections itself is pure (no I/O, no workspace arg).
 */

import {
  deriveMemberConnections,
  type ConnectionRsvpRow,
  type ReferralEdge,
} from '@/lib/member-connections';
import { db } from '@/lib/db';

// ─── Shared contract ──────────────────────────────────────────────────────────

export type MemberConnectionEntry = {
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  /** Human-readable relation, never a raw enum. */
  relationLabel: string;
};

export type MemberConnections = {
  memberId: string;
  connections: MemberConnectionEntry[];
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Derive the connection list for a member.
 *
 * @param workspaceId  Server-derived from requireWorkspaceId — NEVER from client input.
 * @param memberId     URL param; ownership verified by workspace-scoped queries.
 */
export async function getMemberConnections(
  workspaceId: string,
  memberId: string,
): Promise<MemberConnections> {
  // Verify the member belongs to this workspace (ownership gate).
  const memberExists = await db.member.findFirst({
    where: { id: memberId, workspaceId, mergedIntoId: null },
    select: { id: true },
  });
  if (!memberExists) {
    // Return empty rather than leaking existence signal across workspaces.
    return { memberId, connections: [] };
  }

  // Fetch RSVP rows for the connections lib — workspace-scoped.
  // Fetches all workspace RSVPs so deriveMemberConnections can resolve
  // co-attendance across the full event graph. At typical operator scale
  // (~1k–10k RSVPs) one indexed scan is fine. If a workspace exceeds ~50k
  // RSVPs, scope to events the target member attended first.
  const rsvpRows = await db.rSVP.findMany({
    where: { workspaceId },
    select: {
      memberId: true,
      eventId: true,
      checkedIn: true,
      checkedInAt: true,
      plusOneOfMemberId: true,
      paymentStatus: true,
      amountCents: true,
    },
  });

  // Referral edges — both directions for the target member, workspace-scoped.
  const referralRows = await db.member.findMany({
    where: { workspaceId },
    select: { id: true, referredByMemberId: true },
  });
  const referralEdges: ReferralEdge[] = referralRows.map((m) => ({
    memberId: m.id,
    referredByMemberId: m.referredByMemberId,
  }));

  // Derive connections via the existing lib (no AI, pure derivation).
  const derived = deriveMemberConnections(
    memberId,
    rsvpRows as ConnectionRsvpRow[],
    referralEdges,
  );

  // Collect all referenced memberIds so we can fetch names in one query.
  const relatedIds = new Set<string>();

  for (const e of derived.brought) relatedIds.add(e.memberId);
  for (const id of derived.broughtBy) relatedIds.add(id);
  for (const e of derived.referred) relatedIds.add(e.memberId);
  if (derived.referredBy) relatedIds.add(derived.referredBy);

  // Also include top co-attendees (cap at 10 to keep the response lean).
  const topCoAttendees = derived.coAttendees.slice(0, 10);
  for (const c of topCoAttendees) relatedIds.add(c.memberId);

  const relatedIdsArr = [...relatedIds].filter((id) => id !== memberId);

  let nameMap = new Map<string, { firstName: string; lastName: string }>();
  if (relatedIdsArr.length > 0) {
    const nameRows = await db.member.findMany({
      where: { id: { in: relatedIdsArr }, workspaceId },
      select: { id: true, firstName: true, lastName: true },
    });
    nameMap = new Map(nameRows.map((r) => [r.id, { firstName: r.firstName, lastName: r.lastName }]));
  }

  function entry(id: string, label: string): MemberConnectionEntry {
    const names = nameMap.get(id);
    return {
      memberId: id,
      firstName: names?.firstName ?? null,
      lastName: names?.lastName ?? null,
      relationLabel: label,
    };
  }

  const connections: MemberConnectionEntry[] = [];

  // Referral: this member was referred by someone.
  if (derived.referredBy) {
    connections.push(entry(derived.referredBy, 'Referred by'));
  }

  // Referral: this member referred others.
  for (const e of derived.referred) {
    connections.push(entry(e.memberId, 'Referred'));
  }

  // Plus-one: this member brought others.
  for (const e of derived.brought) {
    connections.push(entry(e.memberId, 'Brought'));
  }

  // Plus-one: this member was brought by others.
  for (const id of derived.broughtBy) {
    connections.push(entry(id, 'Brought by'));
  }

  // Co-attendees (top 10 by shared events, not lapsed signals — informational).
  for (const c of topCoAttendees) {
    connections.push(entry(c.memberId, 'Frequent co-attendee'));
  }

  return { memberId, connections };
}
