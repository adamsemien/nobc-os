/**
 * verify-submit-atomicity.ts — exercises the reworked membership submit route
 * (Option B: score-first, one write transaction) against a REAL database
 * (Neon DEV branch only). Modeled on scripts/verify-reject-guards.ts.
 *
 * Proves, with assertions:
 *   (1) ATOMICITY — an induced failure on the in-tx aiScore write (on a PURPLE
 *       draft, so the tx also carries the APPROVED update + purple audit) leaves
 *       ZERO durable tx footprint: submittedAt null, status PENDING, reviewedAt
 *       null, aiScore null, no audit rows. A retry then succeeds (lock released).
 *   (2) EMAIL IDEMPOTENCY — submit then resubmit: the purple-welcome resend stub
 *       count is exactly 1, and the resubmit adds ZERO resend calls of any kind
 *       (it short-circuits on the already-scored guard before any write/email).
 *   (3) NO DRIFT — application.reviewedAt and member.approvedAt captured after
 *       the first submit are unchanged after a resubmit.
 *   (4) BILLING SHORT-CIRCUIT — a watchlisted-BLOCKED draft and a duplicate
 *       draft never invoke the scoreApplication stub.
 *   (5) RESPONSE SHAPE — the fresh reveal contains rsvpId, memberQrCode and
 *       subline (full documented key set); the resubmit returns the documented
 *       cached-replay shape.
 *   (6) CONCURRENCY (best-effort) — two concurrent submits on a fresh PURPLE
 *       draft: exactly one aiScore write, one purple audit row, one comp RSVP,
 *       one welcome email; the scoreApplication stub count is printed (2 is the
 *       accepted wasted-call tradeoff).
 *
 * REGRESSION-LOCK NOTE (documented, deliberately NOT exercised): a SCORING
 * failure is NOT an atomicity trigger. lib/scoring.ts catches internally and
 * returns a fallback score (lib/scoring.ts:307-310, FALLBACK at :98), so the
 * route persists a fallback-scored submission instead of aborting. That silent
 * fallback is a separately docketed follow-up and is untouched by this change.
 * scoreApplication is stubbed here, so the real fallback path cannot run in
 * this harness.
 *
 * SAFETY
 *  - Refuses to run unless DATABASE_URL resolves to the dev host
 *    ep-sweet-term-aj6ovllz. Hard-refuses ep-twilight-forest. Echoes the host.
 *  - No Anthropic spend: scoreApplication is stubbed (deterministic + counted).
 *  - No real email: lib/resend is stubbed (counted, idempotencyKey captured).
 *    RESEND_API_KEY / SVIX_API_KEY are also unset, belt-and-suspenders.
 *  - Slack + the off-platform application backup are stubbed to no-ops.
 *  - Only the draft-cookie auth check and the public rate limiter are stubbed
 *    so the route reaches the real guards; every guard under test is real.
 *  - Every row it creates is deleted (best-effort, logged) in a finally block.
 *
 * tsx compiles to CJS here (no top-level await): all logic lives in main().
 *
 *   Run:  ./node_modules/.bin/tsx scripts/verify-submit-atomicity.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

// Kill external side effects BEFORE any app module reads these keys.
delete process.env.RESEND_API_KEY;
delete process.env.SVIX_API_KEY;

const DEV_HOST_FRAGMENT = 'ep-sweet-term-aj6ovllz';
const PROD_HOST_FRAGMENT = 'ep-twilight-forest';

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

// ── Stub state (read by the Module._load interceptors below) ─────────────────
let scoreCalls = 0;
const resendSends: Array<{ to: unknown; subject: string; idempotencyKey?: string }> = [];
let failAiScoreWrite = false; // atomicity induction: throw on the in-tx aiScore update
const afterPending: Promise<unknown>[] = []; // captured next/server after() callbacks

/** Deterministic scoreApplication result — satisfies every field the route persists. */
const STUB_SCORE = {
  archetype: 'Connector',
  archetypeScores: { Connector: 90, Host: 60, Builder: 55, Patron: 40, Sage: 35, Spark: 30 },
  memberWorthTotal: 66,
  aiRecommendation: 'yes',
  aiReasoning: 'stubbed - deterministic verify run',
  tags: ['stub-tag'],
  secondary: 'Host',
  blend: { primary: 55, secondary: 45 },
  openerPhrase: 'stub opener',
  habitatThrive: 'stub thrive',
  habitatDim: 'stub dim',
  personalNote: 'stub personal note',
  subline: 'stub subline',
};

/**
 * Intercept module loads (same Proxy pattern as verify-reject-guards.ts —
 * esbuild's CJS export getters are not writable, so overrides go through a
 * Proxy on the namespace object).
 */
function installStubs(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    const loaded = origLoad.call(this, request, ...rest);

    // scoreApplication — deterministic + counted. Anchored so deep imports
    // (lib/scoring/inRoomTally etc.) load unstubbed.
    if (/(^|[/])lib\/scoring$/.test(request)) {
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop === 'scoreApplication') {
            return async () => {
              scoreCalls += 1;
              return { ...STUB_SCORE };
            };
          }
          return target[prop];
        },
      });
    }

    // lib/resend — counted send stub, captures the idempotencyKey option.
    if (/(^|[/])lib\/resend$/.test(request)) {
      const resendStub = {
        emails: {
          send: async (
            payload: { to: unknown; subject: string },
            options?: { idempotencyKey?: string },
          ) => {
            resendSends.push({
              to: payload.to,
              subject: payload.subject,
              idempotencyKey: options?.idempotencyKey,
            });
            return { data: { id: `stub-send-${resendSends.length}` }, error: null };
          },
        },
      };
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop === 'resend') return resendStub;
          return target[prop];
        },
      });
    }

    // Draft-cookie auth — always authorized so the route reaches the real guards.
    if (/apply-draft-token$/.test(request)) {
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop === 'verifyApplyDraftToken') return () => true;
          return target[prop];
        },
      });
    }

    // Rate limiter — the harness fires many submits from one "IP".
    if (/public-rate-limit$/.test(request)) {
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop === 'publicRateLimit') return () => ({ allowed: true, retryAfterSecs: 0 });
          return target[prop];
        },
      });
    }

    // Slack notify + off-platform backup — no-ops (no network, no extra dev rows).
    if (/comments-notify$/.test(request)) {
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop === 'maybeFireSlack') return async () => {};
          return target[prop];
        },
      });
    }
    if (/applications\/backup$/.test(request)) {
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop === 'backupApplication') return async () => {};
          return target[prop];
        },
      });
    }

    // next/server — after() throws outside a Next request scope in a bare tsx
    // run; capture the callback's promise so the harness can flush it inline.
    if (request === 'next/server') {
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop === 'after') {
            return (fn: unknown) => {
              const p =
                typeof fn === 'function'
                  ? Promise.resolve().then(fn as () => unknown)
                  : Promise.resolve(fn);
              afterPending.push(p.catch(() => {}));
            };
          }
          return target[prop];
        },
      });
    }

    // lib/db — wrap $transaction so the atomicity test can make the in-tx
    // aiScore write throw. Pass-through unless failAiScoreWrite is set.
    if (/(^|[/])lib\/db$/.test(request)) {
      return new Proxy(loaded, {
        get(target, prop) {
          if (prop !== 'db') return target[prop];
          const realDb = target.db;
          return new Proxy(realDb, {
            get(dbTarget, dbProp) {
              if (dbProp !== '$transaction') return Reflect.get(dbTarget, dbProp);
              return (fnOrOps: unknown, opts?: unknown) => {
                if (typeof fnOrOps !== 'function' || !failAiScoreWrite) {
                  return dbTarget.$transaction(fnOrOps as never, opts as never);
                }
                const fn = fnOrOps as (tx: unknown) => Promise<unknown>;
                return dbTarget.$transaction(
                  (tx: Record<string, any>) =>
                    fn(
                      new Proxy(tx, {
                        get(txTarget, txProp) {
                          if (txProp !== 'application') return Reflect.get(txTarget, txProp);
                          return new Proxy(txTarget.application, {
                            get(appTarget, appProp) {
                              if (appProp !== 'update') return Reflect.get(appTarget, appProp);
                              return async (args: { data?: Record<string, unknown> }) => {
                                if (args?.data && 'aiScore' in args.data) {
                                  throw new Error('INDUCED_TX_ABORT (verify-submit-atomicity)');
                                }
                                return appTarget.update(args);
                              };
                            },
                          });
                        },
                      }),
                    ),
                  opts as never,
                );
              };
            },
          });
        },
      });
    }

    return loaded;
  };
}

async function flushAfter(): Promise<void> {
  // Drain captured after() callbacks (door-1 email, backup stub) so their
  // sends are counted before the next assertion. New callbacks may be pushed
  // while awaiting, so loop until quiet.
  while (afterPending.length) {
    const batch = afterPending.splice(0, afterPending.length);
    await Promise.allSettled(batch);
  }
}

async function main() {
  assertDevHostOrAbort();
  installStubs();

  // All imports are dynamic and happen AFTER the host guard + stubs so no DB
  // client is constructed against the wrong host and no stub is bypassed.
  const { db } = await import('../lib/db');
  const { NextRequest } = await import('next/server');
  const { ACTIVE_EVENT_ID } = await import('../lib/active-event');
  const submitRoute = await import('../app/api/apply/membership/[id]/submit/route');

  const RUN = Date.now();
  const mail = (tag: string) => `verify-submit-${tag}-${RUN}@example.invalid`;

  async function postSubmit(id: string) {
    const req = new NextRequest(`http://localhost/api/apply/membership/${id}/submit`, {
      method: 'POST',
    });
    const res = await submitRoute.POST(req, { params: Promise.resolve({ id }) });
    await flushAfter();
    return res;
  }

  const ws = await db.workspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!ws) throw new Error('ABORT: no workspace found in the dev database.');
  console.log(`using dev workspaceId = ${ws.id}`);

  const appIds: string[] = [];
  const watchIds: string[] = [];
  const emails: string[] = [];
  let createdEventId: string | null = null;

  const mkDraft = async (tag: string) => {
    const email = mail(tag);
    emails.push(email);
    const app = await db.application.create({
      data: {
        workspaceId: ws.id,
        email,
        fullName: `Verify Submit ${tag}`,
        submittedAt: null,
      },
      select: { id: true, email: true },
    });
    appIds.push(app.id);
    return app;
  };
  const mkWatch = async (type: 'PURPLE' | 'BLOCKED', matchEmail: string) => {
    const row = await db.watchList.create({
      data: { workspaceId: ws.id, type, matchEmail, note: 'verify-submit-atomicity fixture' },
      select: { id: true },
    });
    watchIds.push(row.id);
    return row;
  };

  try {
    // ── Fixture: the Door 1 active event (created only if absent) ──────────
    const activeEvent = await db.event.findFirst({
      where: { id: ACTIVE_EVENT_ID, workspaceId: ws.id },
      select: { id: true },
    });
    if (!activeEvent) {
      await db.event.create({
        data: {
          id: ACTIVE_EVENT_ID,
          workspaceId: ws.id,
          slug: `verify-submit-active-event-${RUN}`,
          title: 'Verify Submit Active Event',
          startAt: new Date(RUN + 24 * 60 * 60 * 1000),
          status: 'PUBLISHED',
        },
      });
      createdEventId = ACTIVE_EVENT_ID;
      console.log(`created throwaway active event ${ACTIVE_EVENT_ID} (will delete)`);
    } else {
      console.log(`active event ${ACTIVE_EVENT_ID} already present in dev — reusing, will NOT delete`);
    }
    console.log('');

    // ══ (5) RESPONSE SHAPE — fresh plain submit ═══════════════════════════
    const plain = await mkDraft('plain');
    const scoreBefore = scoreCalls;
    const r1 = await postSubmit(plain.id);
    const b1 = (await r1.json()) as Record<string, unknown>;
    check('shape: fresh submit 200', r1.status === 200, `status=${r1.status}`);
    const revealKeys = [
      'archetype', 'archetypeScores', 'memberWorthTotal', 'tags', 'personalNote',
      'secondary', 'blend', 'openerPhrase', 'habitatThrive', 'habitatDim',
      'subline', 'rsvpId', 'memberQrCode',
    ];
    const missing = revealKeys.filter((k) => !(k in b1));
    check('shape: reveal has full documented key set (incl rsvpId, memberQrCode, subline)',
      missing.length === 0, missing.length ? `missing=[${missing.join(',')}]` : `all ${revealKeys.length} keys present`);
    check('shape: rsvpId + memberQrCode are real (comp issued, QR minted)',
      typeof b1.rsvpId === 'string' && typeof b1.memberQrCode === 'string',
      `rsvpId=${String(b1.rsvpId)} memberQrCode=${typeof b1.memberQrCode === 'string' ? '(minted)' : String(b1.memberQrCode)}`);
    check('shape: subline present on fresh reveal', b1.subline === STUB_SCORE.subline, `subline="${String(b1.subline)}"`);
    check('fresh submit scored exactly once', scoreCalls - scoreBefore === 1, `stub calls this submit=${scoreCalls - scoreBefore}`);
    const plainRow = await db.application.findUnique({
      where: { id: plain.id },
      select: { aiScore: true, submittedAt: true },
    });
    check('fresh submit persisted aiScore + submittedAt',
      plainRow?.aiScore === STUB_SCORE.memberWorthTotal / 100 && plainRow?.submittedAt !== null,
      `aiScore=${plainRow?.aiScore} submittedAt=${plainRow?.submittedAt?.toISOString()}`);

    // ══ (2)+(3)+(5) EMAIL IDEMPOTENCY / NO DRIFT / cached shape — PURPLE ══
    const purple = await mkDraft('purple');
    await mkWatch('PURPLE', purple.email);
    const sendsBeforePurple = resendSends.length;
    const rP = await postSubmit(purple.id);
    const bP = (await rP.json()) as Record<string, unknown>;
    check('purple: first submit 200 + fresh reveal', rP.status === 200 && !('cached' in bP), `status=${rP.status} cached=${String(bP.cached)}`);

    const purpleWelcomeCount = () =>
      resendSends.filter((s) => s.idempotencyKey === `purple-welcome/${purple.id}`).length;
    const sendsAfterFirst = resendSends.length;
    check('purple: welcome email sent exactly once, with idempotencyKey',
      purpleWelcomeCount() === 1,
      `purple-welcome sends=${purpleWelcomeCount()} idempotencyKey=purple-welcome/${purple.id} totalSendsThisSubmit=${sendsAfterFirst - sendsBeforePurple}`);

    const afterFirst = await db.application.findUnique({
      where: { id: purple.id },
      select: { status: true, reviewedAt: true, memberId: true, aiScore: true, submittedAt: true },
    });
    check('purple: APPROVED + reviewedAt + aiScore + submittedAt all committed together',
      afterFirst?.status === 'APPROVED' && afterFirst.reviewedAt !== null &&
        afterFirst.aiScore !== null && afterFirst.submittedAt !== null,
      `status=${afterFirst?.status} reviewedAt=${afterFirst?.reviewedAt?.toISOString()} aiScore=${afterFirst?.aiScore}`);
    const memberAfterFirst = afterFirst?.memberId
      ? await db.member.findUnique({ where: { id: afterFirst.memberId }, select: { approvedAt: true } })
      : null;

    const scoreBeforeResubmit = scoreCalls;
    const rP2 = await postSubmit(purple.id);
    const bP2 = (await rP2.json()) as Record<string, unknown>;
    const cachedKeys = [
      'cached', 'archetype', 'archetypeScores', 'tags', 'personalNote',
      'secondary', 'blend', 'openerPhrase', 'habitatThrive', 'habitatDim',
    ];
    const cachedMissing = cachedKeys.filter((k) => !(k in bP2));
    check('shape: resubmit returns documented cached-replay shape',
      rP2.status === 200 && bP2.cached === true && cachedMissing.length === 0,
      cachedMissing.length ? `missing=[${cachedMissing.join(',')}]` : `cached=true, all ${cachedKeys.length} keys present`);
    check('resubmit: zero additional scoring calls (guard hit before scoring)',
      scoreCalls === scoreBeforeResubmit, `stub calls on resubmit=${scoreCalls - scoreBeforeResubmit}`);
    check('resubmit: zero additional resend calls of ANY kind (email idempotency)',
      resendSends.length === sendsAfterFirst,
      `purple-welcome total=${purpleWelcomeCount()} resendCallsAddedByResubmit=${resendSends.length - sendsAfterFirst}`);

    const afterResubmit = await db.application.findUnique({
      where: { id: purple.id },
      select: { reviewedAt: true, memberId: true },
    });
    const memberAfterResubmit = afterResubmit?.memberId
      ? await db.member.findUnique({ where: { id: afterResubmit.memberId }, select: { approvedAt: true } })
      : null;
    check('no drift: application.reviewedAt unchanged by resubmit',
      afterFirst?.reviewedAt?.getTime() === afterResubmit?.reviewedAt?.getTime(),
      `first=${afterFirst?.reviewedAt?.toISOString()} resubmit=${afterResubmit?.reviewedAt?.toISOString()}`);
    check('no drift: member.approvedAt unchanged by resubmit',
      memberAfterFirst?.approvedAt?.getTime() === memberAfterResubmit?.approvedAt?.getTime(),
      `first=${memberAfterFirst?.approvedAt?.toISOString()} resubmit=${memberAfterResubmit?.approvedAt?.toISOString()}`);

    // ══ (4) BILLING SHORT-CIRCUIT — BLOCKED, then duplicate ═══════════════
    const blocked = await mkDraft('blocked');
    await mkWatch('BLOCKED', blocked.email);
    const scoreBeforeBlocked = scoreCalls;
    const rB = await postSubmit(blocked.id);
    const bB = (await rB.json()) as Record<string, unknown>;
    check('blocked: returns { blocked: true }', rB.status === 200 && bB.blocked === true && !('cached' in bB), `status=${rB.status} body=${JSON.stringify(bB)}`);
    check('blocked: scoreApplication NEVER called', scoreCalls === scoreBeforeBlocked, `stub calls=${scoreCalls - scoreBeforeBlocked}`);
    const blockedRow = await db.application.findUnique({
      where: { id: blocked.id },
      select: { status: true, submittedAt: true },
    });
    const blockedAudits = await db.auditEvent.count({
      where: { entityType: 'Application', entityId: blocked.id, action: 'application.blocked' },
    });
    check('blocked: REJECTED + submittedAt + audit committed together',
      blockedRow?.status === 'REJECTED' && blockedRow.submittedAt !== null && blockedAudits === 1,
      `status=${blockedRow?.status} submittedAt=${blockedRow?.submittedAt?.toISOString()} auditRows=${blockedAudits}`);

    const dupEmail = mail('dup');
    emails.push(dupEmail);
    const dupExisting = await db.application.create({
      data: { workspaceId: ws.id, email: dupEmail, fullName: 'Verify Submit Dup Existing', submittedAt: new Date() },
      select: { id: true },
    });
    appIds.push(dupExisting.id);
    const dupDraft = await db.application.create({
      data: { workspaceId: ws.id, email: dupEmail, fullName: 'Verify Submit Dup Draft', submittedAt: null },
      select: { id: true },
    });
    appIds.push(dupDraft.id);
    const scoreBeforeDup = scoreCalls;
    const rD = await postSubmit(dupDraft.id);
    const bD = (await rD.json()) as Record<string, unknown>;
    check('duplicate: 409 duplicate_application', rD.status === 409 && bD.error === 'duplicate_application', `status=${rD.status} body=${JSON.stringify(bD)}`);
    check('duplicate: scoreApplication NEVER called', scoreCalls === scoreBeforeDup, `stub calls=${scoreCalls - scoreBeforeDup}`);
    const dupAudits = await db.auditEvent.count({
      where: { entityType: 'Application', entityId: dupDraft.id, action: 'application.duplicate_blocked' },
    });
    check('duplicate: audit row committed', dupAudits === 1, `auditRows=${dupAudits}`);

    // ══ (1) ATOMICITY — induced abort of the in-tx aiScore write ══════════
    // PURPLE draft, so the aborting tx also carries the APPROVED update + the
    // purple audit — the rollback must take ALL of them down. (NOTE: this is an
    // induced WRITE failure. A SCORING failure is a different case — the route
    // would persist a fallback score, see the regression-lock note in the header.)
    const atomic = await mkDraft('atomic');
    await mkWatch('PURPLE', atomic.email);
    const welcomeKeyAtomic = `purple-welcome/${atomic.id}`;
    failAiScoreWrite = true;
    let atomicThrew = false;
    let atomicErr = '';
    try {
      await postSubmit(atomic.id);
    } catch (e) {
      atomicThrew = true;
      atomicErr = e instanceof Error ? e.message : String(e);
    } finally {
      failAiScoreWrite = false;
    }
    check('atomicity: induced in-tx write failure surfaced (request failed)',
      atomicThrew && atomicErr.includes('INDUCED_TX_ABORT'), `threw=${atomicThrew} err="${atomicErr}"`);
    const atomicRow = await db.application.findUnique({
      where: { id: atomic.id },
      select: { status: true, submittedAt: true, reviewedAt: true, aiScore: true, memberId: true },
    });
    const atomicAudits = await db.auditEvent.count({
      where: { entityType: 'Application', entityId: atomic.id },
    });
    check('atomicity: ZERO durable tx footprint (status/submittedAt/reviewedAt/aiScore/memberId all rolled back)',
      atomicRow?.status === 'PENDING' && atomicRow.submittedAt === null &&
        atomicRow.reviewedAt === null && atomicRow.aiScore === null && atomicRow.memberId === null,
      `status=${atomicRow?.status} submittedAt=${atomicRow?.submittedAt} reviewedAt=${atomicRow?.reviewedAt} aiScore=${atomicRow?.aiScore} memberId=${atomicRow?.memberId}`);
    check('atomicity: zero audit rows survived the rollback', atomicAudits === 0, `auditRows=${atomicAudits}`);
    check('atomicity: welcome email NOT sent on the aborted attempt (send is post-commit)',
      resendSends.filter((s) => s.idempotencyKey === welcomeKeyAtomic).length === 0,
      `welcome sends for aborted draft=${resendSends.filter((s) => s.idempotencyKey === welcomeKeyAtomic).length}`);
    // Documented, expected: the OUTSIDE-tx idempotent member promotion DID run
    // (that is the ratified design — replay-safe by construction, not rolled back).
    const atomicMember = await db.member.findFirst({
      where: { workspaceId: ws.id, email: atomic.email },
      select: { id: true, status: true },
    });
    console.log(`      (documented, by design: outside-tx member resolution persisted — member=${atomicMember?.id ?? '(none)'} status=${atomicMember?.status ?? '-'})`);

    // Retry after the failure: the advisory lock was released at ROLLBACK and
    // aiScore is still null, so a clean retry must fully succeed.
    const rRetry = await postSubmit(atomic.id);
    const retryRow = await db.application.findUnique({
      where: { id: atomic.id },
      select: { status: true, aiScore: true, submittedAt: true },
    });
    check('atomicity: clean retry after induced failure fully succeeds',
      rRetry.status === 200 && retryRow?.status === 'APPROVED' && retryRow.aiScore !== null && retryRow.submittedAt !== null,
      `status=${rRetry.status} row.status=${retryRow?.status} aiScore=${retryRow?.aiScore}`);
    check('atomicity: retry sent the welcome email exactly once (idempotencyKey scoped)',
      resendSends.filter((s) => s.idempotencyKey === welcomeKeyAtomic).length === 1,
      `welcome sends after retry=${resendSends.filter((s) => s.idempotencyKey === welcomeKeyAtomic).length}`);

    // ══ (6) CONCURRENCY (best-effort) — two simultaneous PURPLE submits ═══
    const conc = await mkDraft('concurrent');
    await mkWatch('PURPLE', conc.email);
    const scoreBeforeConc = scoreCalls;
    const welcomeKeyConc = `purple-welcome/${conc.id}`;
    const [rc1, rc2] = await Promise.all([postSubmit(conc.id), postSubmit(conc.id)]);
    await flushAfter();
    const [bc1, bc2] = [
      (await rc1.json()) as Record<string, unknown>,
      (await rc2.json()) as Record<string, unknown>,
    ];
    const freshCount = [bc1, bc2].filter((b) => !('cached' in b)).length;
    const cachedCount = [bc1, bc2].filter((b) => b.cached === true).length;
    check('concurrency: both submits 200, exactly one fresh winner + one cached loser',
      rc1.status === 200 && rc2.status === 200 && freshCount === 1 && cachedCount === 1,
      `statuses=${rc1.status}/${rc2.status} fresh=${freshCount} cached=${cachedCount}`);
    const concRow = await db.application.findUnique({
      where: { id: conc.id },
      select: { aiScore: true, status: true, memberId: true },
    });
    const concPurpleAudits = await db.auditEvent.count({
      where: { entityType: 'Application', entityId: conc.id, action: 'application.purple_list_approved' },
    });
    const concComps = concRow?.memberId
      ? await db.rSVP.count({
          where: { workspaceId: ws.id, eventId: ACTIVE_EVENT_ID, memberId: concRow.memberId, isComp: true, compType: 'APPLICATION' },
        })
      : 0;
    const concWelcomes = resendSends.filter((s) => s.idempotencyKey === welcomeKeyConc).length;
    check('concurrency: single-winner writes — one aiScore, one purple audit, one comp, one welcome email',
      concRow?.aiScore !== null && concRow?.status === 'APPROVED' && concPurpleAudits === 1 && concComps === 1 && concWelcomes === 1,
      `aiScore=${concRow?.aiScore} purpleAudits=${concPurpleAudits} comps=${concComps} welcomeSends=${concWelcomes}`);
    console.log(`      (accepted tradeoff: scoreApplication stub calls for the concurrent pair = ${scoreCalls - scoreBeforeConc} — 2 is the accepted wasted-call cost, writes stayed single-winner)`);
  } finally {
    // ── Cleanup (best-effort, every statement individually guarded) ────────
    console.log('\ncleanup:');
    const tidy = async (label: string, fn: () => Promise<{ count: number } | unknown>) => {
      try {
        const out = (await fn()) as { count?: number };
        console.log(`  ${label}: ${typeof out?.count === 'number' ? `${out.count} row(s)` : 'ok'}`);
      } catch (e) {
        console.log(`  ${label}: SKIPPED (${e instanceof Error ? e.message.split('\n')[0] : e})`);
      }
    };
    const { db } = await import('../lib/db');
    const members = await db.member
      .findMany({ where: { workspaceId: ws.id, email: { in: emails } }, select: { id: true, personId: true } })
      .catch(() => [] as { id: string; personId: string | null }[]);
    const memberIds = members.map((m) => m.id);
    const personIds = members.map((m) => m.personId).filter((p): p is string => p !== null);
    await tidy('rsvps', () => db.rSVP.deleteMany({ where: { workspaceId: ws.id, memberId: { in: memberIds } } }));
    await tidy('audit events', () => db.auditEvent.deleteMany({ where: { entityType: 'Application', entityId: { in: appIds } } }));
    await tidy('applications', () => db.application.deleteMany({ where: { id: { in: appIds } } }));
    await tidy('watchlist fixtures', () => db.watchList.deleteMany({ where: { id: { in: watchIds } } }));
    await tidy('engagement events', () => db.memberEngagementEvent.deleteMany({ where: { memberId: { in: memberIds } } }));
    await tidy('channel subscriptions', () =>
      db.channelSubscription.deleteMany({ where: { OR: [{ memberId: { in: memberIds } }, { personId: { in: personIds } }] } }));
    await tidy('members', () => db.member.deleteMany({ where: { id: { in: memberIds } } }));
    await tidy('contact sources', () => db.contactSource.deleteMany({ where: { personId: { in: personIds } } }));
    await tidy('persons', () => db.person.deleteMany({ where: { id: { in: personIds } } }));
    if (createdEventId) {
      await tidy('throwaway active event', () => db.event.delete({ where: { id: createdEventId! } }));
    }
    await db.$disconnect().catch(() => {});
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed =====`);
  console.log(`stub counts: scoreApplication=${scoreCalls} resend.emails.send=${resendSends.length}`);
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
