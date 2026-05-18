/** Smoke test for the agent tool registry.
 *  Run: ./node_modules/.bin/tsx scripts/test-agent-registry.ts */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { listTools, registerTool } = await import('@/lib/agent/registry');
  await import('@/lib/agent/tools'); // side effect: register all 14

  const tools = listTools();
  console.log(`Registered tools: ${tools.length}`);
  for (const t of tools) {
    const kind = t.requiresConfirmation ? 'WRITE (confirm)' : t.auditAction ? 'WRITE' : 'READ';
    console.log(`  ${t.name.padEnd(28)} ${kind}`);
  }

  // Workspace-scoping guard: a handler that never references workspaceId
  // must be refused at registration.
  console.log('\nWorkspace-scoping guard:');
  try {
    registerTool({
      name: 'test.unscoped',
      description: 'deliberately broken — no workspace scoping',
      // @ts-expect-error — minimal stub for the guard test
      inputSchema: { parse: (x: unknown) => x },
      requiresConfirmation: false,
      auditAction: '',
      auditEntityType: '',
      handler: async () => ({ leaked: 'everything' }),
    });
    console.log('  FAIL — unscoped tool was registered (guard did not fire)');
    process.exit(1);
  } catch (e) {
    console.log(`  PASS — guard rejected it: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(`\nResult: ${tools.length === 14 ? 'PASS' : 'FAIL'} — expected 14, got ${tools.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
