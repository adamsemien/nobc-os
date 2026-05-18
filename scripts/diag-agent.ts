/** Diagnostic: reproduce agent turns directly (bypasses Clerk) and surface
 *  the real errors the "AI is unavailable" fallback hides.
 *  Run: ./node_modules/.bin/tsx scripts/diag-agent.ts */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function runTurn(label: string, message: string) {
  const { db } = await import('@/lib/db');
  const { streamAgentTurn } = await import('@/lib/agent/lib/loop');

  const ws = await db.workspace.findUnique({ where: { slug: 'nobc' } });
  if (!ws) {
    console.error("no workspace 'nobc'");
    return;
  }
  const conv = await db.agentConversation.create({
    data: { workspaceId: ws.id, operatorId: 'diag-operator', title: label },
  });
  await db.agentTurn.create({
    data: { conversationId: conv.id, role: 'USER', content: message, status: 'COMPLETED' },
  });

  console.log(`\n========== ${label}: "${message}" ==========`);
  const res = streamAgentTurn(conv.id, {
    workspaceId: ws.id,
    operatorId: 'diag-operator',
    threadId: conv.id,
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    process.stdout.write(decoder.decode(value, { stream: true }));
  }

  // Persisted turns reveal failed tool calls (status FAILED carries the error).
  const turns = await db.agentTurn.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: 'asc' },
    select: { role: true, toolName: true, status: true, content: true },
  });
  console.log(`\n--- persisted turns for ${label} ---`);
  for (const t of turns) {
    console.log(
      `  ${t.role}${t.toolName ? ` ${t.toolName}` : ''} [${t.status}]` +
        (t.status === 'FAILED' ? ` ERROR: ${t.content}` : ''),
    );
  }
}

async function main() {
  await runTurn('TEST 3', 'find applicants from los angeles');
  await runTurn('TEST 4', "what's the strongest sponsor signal right now?");

  const { db } = await import('@/lib/db');
  await db.$disconnect();
}

main().catch((e) => {
  console.error('DIAG SCRIPT CRASHED:', e);
  process.exit(1);
});
