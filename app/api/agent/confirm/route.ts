/** Confirms a pending (AWAITING_CONFIRMATION) tool call: runs the tool, then
 *  resumes the agent loop so the model can respond to the result. */
export const runtime = 'nodejs';

import { auth } from '@clerk/nextjs/server';
import { Prisma } from '@prisma/client';
import { requireWorkspaceId } from '@/lib/auth';
import { db } from '@/lib/db';
import { executeTool } from '@/lib/agent/registry';
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
  if (turn.status !== 'AWAITING_CONFIRMATION' || !turn.toolName) {
    return Response.json({ error: 'Turn is not awaiting confirmation' }, { status: 409 });
  }

  const ctx = { workspaceId, operatorId: userId, threadId: turn.conversationId };

  try {
    const output = await executeTool(turn.toolName, turn.toolInput, ctx);
    await db.agentTurn.update({
      where: { id: turn.id },
      data: { status: 'COMPLETED', toolOutput: (output ?? {}) as Prisma.InputJsonValue },
    });
  } catch (e) {
    // Tool threw — the loop replays this as a failed result so the model
    // can recover gracefully. Operation does not half-complete silently.
    await db.agentTurn.update({
      where: { id: turn.id },
      data: { status: 'FAILED', content: e instanceof Error ? e.message : 'tool failed' },
    });
  }

  return streamAgentTurn(turn.conversationId, ctx);
}
