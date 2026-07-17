/**
 * verify-reject-guards.ts — exercises the never-submitted reject guards against a
 * REAL database (Neon DEV branch only). This proves the four inline REJECTED
 * writers all refuse to reject a draft (submittedAt === null):
 *
 *   1. POST /api/operator/applications/[id]/reject   (single route)   -> 409
 *   2. POST /api/operator/applications/bulk          (bulk route)     -> not_submitted
 *   3. agent tool  applications.reject                                -> { ok:false, error:'not_submitted' }
 *   4. MCP tool    nobc_reject_application                            -> throws
 *
 * ...and that the single route still rejects with confirmUnsubmitted:true, and a
 * genuinely-submitted application rejects normally.
 *
 * SAFETY
 *  - Refuses to run unless DATABASE_URL resolves to the dev host ep-sweet-term-aj6ovllz.
 *    Hard-refuses the production host ep-twilight-forest. Echoes the host first.
 *  - No email is sent: RESEND_API_KEY is unset before any module loads, so the
 *    `if (process.env.RESEND_API_KEY)` send block in the reject route is never
 *    reached. SVIX_API_KEY is unset too so no outbound webhook fires. (This is a
 *    STUB by unset, not a guard-returns-before-send claim — the success paths DO
 *    run to completion, they just find no Resend/Svix key.)
 *  - Only the Clerk auth gate (requireRole / requirePermission) is stubbed so the
 *    route handlers reach the real submittedAt guard. The guard under test is NOT
 *    stubbed — it runs against the real row.
 *  - Every row it creates is deleted in a finally block.
 *
 * tsx compiles to CJS here (no top-level await): all logic lives in main().
 *
 *   Run:  ./node_modules/.bin/tsx scripts/verify-reject-guards.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

// Kill external side effects BEFORE any app module reads these keys.
delete process.env.RESEND_API_KEY;
delete process.env.SVIX_API_KEY;

const DEV_HOST_FRAGMENT = 'ep-sweet-term-aj6ovllz';
const PROD_HOST_FRAGMENT = 'ep-twilight-forest';

const OPERATOR_ID = 'verify-reject-guards-operator';
// Set once the dev workspace is resolved; the auth stub reads it so the route's
// `app.workspaceId !== workspaceId` check passes.
let stubWorkspaceId = '';

type Result = { step: string; pass: boolean; detail: string };
const results: Result[] = [];
function check(step: string, pass: boolean, detail: string) {
  results.push({ step, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${step}  ::  ${detail}`);
}

function assertDevHostOrAbort(): void {
  const url = process.env.DATABASE_URL ?? '';
  let host = '(unset)';
  try {
    host = new URL(url).host;
  } catch {
    /* leave as (unset)/unparseable below */
  }
  console.log(`resolved DATABASE_URL host = ${host || '(unparseable)'}`);

  if (!url) {
    throw new Error('ABORT: DATABASE_URL is unset. Point it at the dev branch (ep-sweet-term-aj6ovllz).');
  }
  if (url.includes(PROD_HOST_FRAGMENT)) {
    throw new Error(`ABORT: DATABASE_URL points at PRODUCTION (${PROD_HOST_FRAGMENT}). Refusing to run.`);
  }
  if (!url.includes(DEV_HOST_FRAGMENT)) {
    throw new Error(
      `ABORT: DATABASE_URL host is not the dev branch (${DEV_HOST_FRAGMENT}). Refusing to run against ${host}.`,
    );
  }
  console.log(`host confirmed dev (${DEV_HOST_FRAGMENT}) — proceeding.\n`);
}

/**
 * Stub ONLY the Clerk auth gate so route handlers reach the real submittedAt
 * guard. A Proxy is used because esbuild's CJS export getters are not writable.
 */
function installAuthGateStub(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    const loaded = origLoad.call(this, request, ...rest);
    if (/operator-role/.test(request)) {
      const gate = async () => ({
        ok: true,
        userId: OPERATOR_ID,
        workspaceId: stubWorkspaceId,
        role: loaded.OperatorRole?.ADMIN ?? 'ADMIN',
      });
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop === 'requireRole' || prop === 'requirePermission') return gate;
          return target[prop];
        },
      });
    }
    return loaded;
  };
}

function jsonRequest(NextRequest: any, url: string, payload: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function main() {
  assertDevHostOrAbort();
  installAuthGateStub();

  // All imports are dynamic and happen AFTER the host guard so no DB client is
  // constructed against the wrong host.
  const { db } = await import('../lib/db');
  const { NextRequest } = await import('next/server');
  const rejectRoute = await import('../app/api/operator/applications/[id]/reject/route');
  const bulkRoute = await import('../app/api/operator/applications/bulk/route');
  const agentRejectMod = await import('../lib/agent/tools/applications/reject');
  const mcpApplications = await import('../lib/mcp/tools/applications');

  const agentReject: any = agentRejectMod.default;
  const mcpReject: any = (mcpApplications.applicationTools as any[]).find(
    (t) => t.name === 'nobc_reject_application',
  );

  // Resolve a real dev workspace so FK + workspace-scoping checks are genuine.
  const ws = await db.workspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!ws) throw new Error('ABORT: no workspace found in the dev database.');
  stubWorkspaceId = ws.id;
  console.log(`using dev workspaceId = ${ws.id}\n`);

  const draftIds: string[] = [];
  let draftId = '';
  let submittedId = '';

  try {
    // Step 1 — throwaway draft (never submitted) + a genuinely-submitted row.
    const draft = await db.application.create({
      data: {
        workspaceId: ws.id,
        email: `verify-reject-draft-${Date.now()}@example.invalid`,
        fullName: 'Verify Reject Draft',
        submittedAt: null,
      },
      select: { id: true, status: true, submittedAt: true },
    });
    draftId = draft.id;
    draftIds.push(draft.id);
    check('step1 create draft', draft.submittedAt === null && draft.status === 'PENDING',
      `id=${draft.id} status=${draft.status} submittedAt=${draft.submittedAt}`);

    const submitted = await db.application.create({
      data: {
        workspaceId: ws.id,
        email: `verify-reject-submitted-${Date.now()}@example.invalid`,
        fullName: 'Verify Reject Submitted',
        submittedAt: new Date(),
      },
      select: { id: true, status: true, submittedAt: true },
    });
    submittedId = submitted.id;
    check('step7a create submitted', submitted.submittedAt !== null && submitted.status === 'PENDING',
      `id=${submitted.id} status=${submitted.status} submittedAt=${submitted.submittedAt?.toISOString()}`);

    // NOTE ON ORDERING: steps 2/4/5/6 are all fail-closed and do NOT mutate the
    // draft, so one draft proves all of them. The mutating override (step 3) runs
    // LAST on that same draft — keeping exactly the two rows step 8 cleans up.

    // Step 2 — single route, no confirmUnsubmitted -> 409.
    const r2 = await rejectRoute.POST(
      jsonRequest(NextRequest, `http://localhost/api/operator/applications/${draftId}/reject`, {}),
      { params: Promise.resolve({ id: draftId }) },
    );
    check('step2 single reject (no confirm) => 409', r2.status === 409, `status=${r2.status}`);

    // Step 4 — bulk reject -> not_submitted in failures, row not mutated.
    const r4 = await bulkRoute.POST(
      jsonRequest(NextRequest, 'http://localhost/api/operator/applications/bulk', {
        ids: [draftId],
        action: 'reject',
      }),
    );
    const b4 = (await r4.json()) as { succeeded: number; failed: number; failures: { id: string; error: string }[] };
    const hasNotSubmitted = (b4.failures ?? []).some((f) => f.error === 'not_submitted');
    check('step4 bulk reject => not_submitted', hasNotSubmitted && b4.failed === 1 && b4.succeeded === 0,
      `succeeded=${b4.succeeded} failed=${b4.failed} failures=${JSON.stringify(b4.failures)}`);
    const afterBulk = await db.application.findUnique({ where: { id: draftId }, select: { status: true } });
    check('step4 bulk reject => status still not REJECTED', afterBulk?.status !== 'REJECTED',
      `status=${afterBulk?.status}`);

    // Step 5 — agent tool -> { ok:false, error:'not_submitted' }.
    const r5 = await agentReject.handler({ applicationId: draftId }, { workspaceId: ws.id, operatorId: OPERATOR_ID });
    check('step5 agent applications.reject => not_submitted',
      r5 && r5.ok === false && r5.error === 'not_submitted', `result=${JSON.stringify(r5)}`);

    // Step 6 — MCP tool -> throws.
    let threw = false;
    let mcpMsg = '';
    try {
      await mcpReject.handler({ workspaceId: ws.id, userId: OPERATOR_ID }, { applicationId: draftId });
    } catch (e) {
      threw = true;
      mcpMsg = e instanceof Error ? e.message : String(e);
    }
    check('step6 MCP nobc_reject_application => throws', threw, `threw=${threw} message="${mcpMsg}"`);

    // Confirm none of steps 2/4/5/6 mutated the draft.
    const stillDraft = await db.application.findUnique({ where: { id: draftId }, select: { status: true } });
    check('draft untouched by fail-closed guards', stillDraft?.status === 'PENDING', `status=${stillDraft?.status}`);

    // Step 3 — single route with confirmUnsubmitted:true -> succeeds, row REJECTED.
    const r3 = await rejectRoute.POST(
      jsonRequest(NextRequest, `http://localhost/api/operator/applications/${draftId}/reject`, {
        confirmUnsubmitted: true,
      }),
      { params: Promise.resolve({ id: draftId }) },
    );
    const afterOverride = await db.application.findUnique({ where: { id: draftId }, select: { status: true } });
    check('step3 single reject (confirmUnsubmitted:true) => succeeds',
      r3.status === 200 && afterOverride?.status === 'REJECTED', `status=${r3.status} row=${afterOverride?.status}`);

    // Step 7 — plain reject on a genuinely-submitted row -> succeeds.
    const r7 = await rejectRoute.POST(
      jsonRequest(NextRequest, `http://localhost/api/operator/applications/${submittedId}/reject`, {}),
      { params: Promise.resolve({ id: submittedId }) },
    );
    const afterSubmitted = await db.application.findUnique({ where: { id: submittedId }, select: { status: true } });
    check('step7 plain reject on submitted => succeeds',
      r7.status === 200 && afterSubmitted?.status === 'REJECTED', `status=${r7.status} row=${afterSubmitted?.status}`);
  } finally {
    // Step 8 — cleanup. Delete audit rows first (FK-free but tidy), then the apps.
    const ids = [draftId, submittedId, ...draftIds].filter((v, i, a) => v && a.indexOf(v) === i);
    try {
      await db.auditEvent.deleteMany({ where: { entityType: 'APPLICATION', entityId: { in: ids } } });
    } catch (e) {
      console.log(`cleanup: auditEvent delete skipped (${e instanceof Error ? e.message : e})`);
    }
    try {
      const del = await db.application.deleteMany({ where: { id: { in: ids } } });
      console.log(`\ncleanup: deleted ${del.count} application row(s) [${ids.join(', ')}]`);
    } catch (e) {
      console.log(`cleanup: application delete FAILED (${e instanceof Error ? e.message : e})`);
    }
    await db.$disconnect().catch(() => {});
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed =====`);
  if (failed.length) {
    console.log('FAILED assertions:');
    for (const f of failed) console.log(`  - ${f.step} :: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
