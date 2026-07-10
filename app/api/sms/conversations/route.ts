import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';
import { resolveConversationIdentities } from '@/lib/sms-conversation-identity';

// Shared multi-operator House Phone inbox feed. Authorized by Clerk org
// membership: any member of the resolved workspace's Clerk org may read it (no
// separate WorkspaceMember/role row required — workspace membership is the
// boundary, matching /api/sms/analytics). The UI polls this endpoint for
// near-real-time updates; each conversation carries its recent thread so no
// separate per-conversation messages route is needed.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = await getMemberWorkspaceId(userId);
  if (!workspaceId) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const conversations = await db.smsConversation.findMany({
    where: { workspaceId },
    include: {
      event: { select: { id: true, title: true } },
      // Most recent 100 messages; reversed to chronological below.
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, direction: true, body: true, aiGenerated: true, createdAt: true },
      },
    },
  });

  // Slice 3 (Communicate + log it) — lazy resolve-on-read. House Phone (Railway)
  // never sets memberId/personId itself; this fills them in for whatever's still
  // unresolved and persists the result so it isn't re-resolved on the next poll.
  const justResolved = await resolveConversationIdentities(db, workspaceId, conversations);

  const shaped = conversations
    .map((c) => {
      const latest = c.messages[0] ?? null;
      const chronological = [...c.messages].reverse();
      const identity = justResolved.get(c.id);
      return {
        id: c.id,
        phone: c.phone,
        name: c.name,
        eventId: c.eventId,
        event: c.event,
        memberId: identity?.memberId ?? c.memberId,
        personId: identity?.personId ?? c.personId,
        aiEnabled: c.aiEnabled,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        messages: chronological.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          aiGenerated: m.aiGenerated,
          createdAt: m.createdAt.toISOString(),
        })),
        lastMessageAt: (latest?.createdAt ?? c.createdAt).toISOString(),
        lastMessagePreview: latest?.body ?? '',
        // Unread = the most recent message is inbound (no operator/AI reply yet).
        unread: latest ? latest.direction === 'INBOUND' : false,
      };
    })
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));

  return NextResponse.json({ conversations: shaped });
}
