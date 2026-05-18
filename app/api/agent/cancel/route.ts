/** Cancels a pending (AWAITING_CONFIRMATION) tool call: marks the turn
 *  CANCELLED, then resumes the agent loop. The model sees a
 *  { status: 'user_cancelled' } result and responds accordingly. */
export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { streamAgentTurn } from '@/lib/agent/lib/loop';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await requireWorkspaceId(userId);

  let body: { turnId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Bad request' }, { status: 400 });
  }
  const turnId = typeof body.turnId === 'string' ? body.turnId : '';
  if (!turnId) return Response.json({ error: 'turnId required' }, { status: 400 });

  const turn = await db.agentTurn.findUnique({
    where: { id: turnId },
    include: { conversation: true },
  });
  if (!turn || turn.conversation.workspaceId !== workspaceId) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (turn.status !== 'AWAITING_CONFIRMATION') {
    return Response.json({ error: 'Turn is not awaiting confirmation' }, { status: 409 });
  }

  await db.agentTurn.update({ where: { id: turn.id }, data: { status: 'CANCELLED' } });

  return streamAgentTurn(turn.conversationId, {
    workspaceId,
    operatorId: userId,
    threadId: turn.conversationId,
  });
}
