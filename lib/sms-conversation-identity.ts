/** Lazy identity resolution for SmsConversation (Slice 3 — Communicate + log it).
 *
 *  House Phone (Railway, a separate repo) writes SmsConversation/SmsMessage rows
 *  directly against the shared Postgres instance for a bare phone number — it has
 *  no Person/Member resolution of its own and never will (cross-repo dependency
 *  explicitly out of scope for this slice). nobc-os fills in memberId/personId
 *  lazily, on read, the first time a conversation is displayed.
 *
 *  Deliberately READ-ONLY matching — never mints a new Person/Member. Unlike
 *  lib/crm/resolve-person.ts's resolvePerson() (which always creates on no match),
 *  an operator loading the House Phone inbox must never spawn a phantom Person just
 *  because a stranger texted the shared line. Resolved once, persisted onto the
 *  row, and never re-attempted for a conversation that already has EITHER pointer
 *  set (a conversation lacking both is retried on every read until a match exists
 *  or a Member/Person shows up with that phone — a small, indexed, accepted cost
 *  for numbers that may never resolve, e.g. one-off strangers).
 */
import type { PrismaClient } from '@prisma/client';

export type ConversationIdentity = { memberId: string | null; personId: string | null };

/** Batch-resolves every unresolved conversation's identity in at most 2 reads (not
 *  N+1), then persists the resolved ones. Returns a map so the caller can shape its
 *  response without a second DB round trip. */
export async function resolveConversationIdentities(
  db: PrismaClient,
  workspaceId: string,
  conversations: { id: string; phone: string; memberId: string | null; personId: string | null }[],
): Promise<Map<string, ConversationIdentity>> {
  const resolved = new Map<string, ConversationIdentity>();
  const unresolved = conversations.filter((c) => !c.memberId && !c.personId);
  if (unresolved.length === 0) return resolved;

  const phones = [...new Set(unresolved.map((c) => c.phone))];

  // Member match wins (the operator-facing surface); Person-only match is the
  // fallback (Phase 2A humans with no membership yet). Prefer the OLDEST match on
  // either table, mirroring resolvePerson's own findCanonicalByEmail tie-break.
  const [members, people] = await Promise.all([
    db.member.findMany({
      where: { workspaceId, phone: { in: phones }, mergedIntoId: null },
      select: { id: true, phone: true, personId: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.person.findMany({
      where: { workspaceId, phone: { in: phones }, mergedIntoId: null },
      select: { id: true, phone: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const memberByPhone = new Map<string, { id: string; personId: string | null }>();
  for (const m of members) if (m.phone && !memberByPhone.has(m.phone)) memberByPhone.set(m.phone, m);
  const personByPhone = new Map<string, string>();
  for (const p of people) if (p.phone && !personByPhone.has(p.phone)) personByPhone.set(p.phone, p.id);

  const updates: { id: string; memberId: string | null; personId: string | null }[] = [];
  for (const c of unresolved) {
    const member = memberByPhone.get(c.phone);
    const personId = member ? member.personId : (personByPhone.get(c.phone) ?? null);
    const memberId = member?.id ?? null;
    if (!memberId && !personId) continue; // still nothing to persist
    updates.push({ id: c.id, memberId, personId });
    resolved.set(c.id, { memberId, personId });
  }

  // Sequential, not Promise.all — this runs on every inbox poll for whatever's
  // still unresolved; keeping it simple over maximally parallel here (small N in
  // practice: only conversations that have never matched anything).
  for (const u of updates) {
    await db.smsConversation
      .update({ where: { id: u.id }, data: { memberId: u.memberId, personId: u.personId } })
      .catch((err) => {
        console.error(`[sms-conversation-identity] persist failed (conversation=${u.id}):`, err);
      });
  }

  return resolved;
}
