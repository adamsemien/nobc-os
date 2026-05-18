/** Diagnostic: runs one real tool per Spotlight shape and prints the
 *  normalized payload + navigation targets. Verifies the agent-result →
 *  Spotlight pipeline without a browser.
 *  Run: ./node_modules/.bin/tsx scripts/diag-spotlight.ts */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('@/lib/db');
  const { normalizeAgentResult, spotlightTargets } = await import('@/lib/agent/lib/spotlight');
  const findApps = (await import('@/lib/agent/tools/applications/find')).default;
  const getApp = (await import('@/lib/agent/tools/applications/get')).default;
  const runMetric = (await import('@/lib/agent/tools/intelligence/run-metric')).default;
  const compose = (await import('@/lib/agent/tools/intelligence/compose')).default;
  await import('@/lib/intelligence');
  const { listMetrics } = await import('@/lib/intelligence/registry');

  const ws = await db.workspace.findUnique({ where: { slug: 'nobc' } });
  if (!ws) {
    console.error("no workspace 'nobc'");
    return;
  }
  const ctx = { workspaceId: ws.id, operatorId: 'diag', threadId: 'diag' };

  const show = (shape: string, toolName: string, output: unknown) => {
    const payload = normalizeAgentResult(toolName, output);
    console.log(`\n══ ${shape}  (${toolName})`);
    console.log('   payload:', JSON.stringify(payload, null, 2).replace(/\n/g, '\n   '));
    console.log('   targets:', payload ? JSON.stringify(spotlightTargets(payload)) : 'n/a');
  };

  // 1. record-list
  const findOut = await findApps.handler({ limit: 5 }, ctx);
  show('record-list', 'applications.find', findOut);

  // 2. record — get the first application from the list above
  const firstId = (findOut as { applications?: { id: string }[] }).applications?.[0]?.id;
  if (firstId) {
    const getOut = await getApp.handler({ applicationId: firstId }, ctx);
    show('record', 'applications.get', getOut);
  } else {
    console.log('\n(record) skipped — no applications in workspace');
  }

  // 3. metric
  const metricId = listMetrics()[0]?.id;
  if (metricId) {
    const metricOut = await runMetric.handler({ metricId }, ctx);
    show('metric', 'intelligence.run_metric', metricOut);
  }

  // 4. composition
  const composeOut = await compose.handler(
    { question: 'What is the strongest sponsor signal right now?' },
    ctx,
  );
  show('composition', 'intelligence.compose', composeOut);

  // 5. mutation — synthetic output (no DB write), exercises the normalizer only
  show('mutation (ok)', 'applications.move_to_hold', {
    ok: true,
    name: 'Test Applicant',
    applicationId: 'app_synthetic',
  });
  show('mutation (fail)', 'applications.approve', { ok: false, error: 'not_found' });

  // 6. empty
  show('empty', 'applications.find', { count: 0, applications: [] });

  await db.$disconnect();
}

main().catch((e) => {
  console.error('DIAG CRASHED:', e);
  process.exit(1);
});
