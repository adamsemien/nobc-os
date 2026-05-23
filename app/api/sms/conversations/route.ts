import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMemberWorkspaceId } from '@/lib/auth';

// Shared multi-operator House Phone inbox feed. Any operator in the workspace
// can read it (workspace membership is the boundary — no role gate, per spec).
// The UI polls this endpoint for near-real-time updates; each conversation
// carries its recent thread so no separate per-conversation messages route is
// needed.
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

  const shaped = conversations
    .map((c) => {
      const latest = c.messages[0] ?? null;
      const chronological = [...c.messages].reverse();
      return {
        id: c.id,
        phone: c.phone,
        name: c.name,
        eventId: c.eventId,
        event: c.event,
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
