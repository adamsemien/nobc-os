/** Cancels a pending (AWAITING_CONFIRMATION) tool call: marks the turn
 *  CANCELLED, then resumes the agent loop. The model sees a
 *  { status: 'user_cancelled' } result and responds accordingly. */
export const runtime = 'nodejs';

import { OperatorRole } from '@prisma/client';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/operator-role';
import { streamAgentTurn } from '@/lib/agent/lib/loop';

export async function POST(req: Request) {
  const gate = await requireRole(OperatorRole.STAFF);
  if (!gate.ok) return gate.response;
  const { userId, workspaceId } = gate;

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
