/** Agent turn endpoint. Node runtime — the tool surface uses Node crypto
 *  (randomUUID/randomBytes/createHash) and qrcode, which Edge cannot provide. */
export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkAgentRateLimit } from '@/lib/agent/lib/rate-limit';
import { streamAgentTurn } from '@/lib/agent/lib/loop';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);
  if (!checkAgentRateLimit(workspaceId)) {
    return Response.json(
      { error: 'Too many agent requests — wait a moment and try again.' },
      { status: 429 },
    );
  }

  let body: { threadId?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return Response.json({ error: 'Message required' }, { status: 400 });
  const threadId = typeof body.threadId === 'string' ? body.threadId : undefined;

  // Resume the thread if it belongs to this workspace, otherwise start fresh.
  let conversation = threadId
    ? await db.agentConversation.findFirst({ where: { id: threadId, workspaceId } })
    : null;
  if (!conversation) {
    conversation = await db.agentConversation.create({
      data: { workspaceId, operatorId: userId, title: message.slice(0, 80) },
    });
  }

  await db.agentTurn.create({
    data: { conversationId: conversation.id, role: 'USER', content: message, status: 'COMPLETED' },
  });

  return streamAgentTurn(conversation.id, {
    workspaceId,
    operatorId: userId,
    threadId: conversation.id,
  });
}
