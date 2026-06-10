import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const ALLOWED = (process.env.DEV_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Compiles + runs two tsx seed scripts against the DB — well past the default timeout.
export const maxDuration = 300;

/**
 * POST — one-click demo seed for the Gravity Ledger (Settings → Developer button).
 * Runs the base demo seed (Tenur tenant + members/events) then the gravity
 * enrichment (plus-one / referral edges + CAPTURED payments) so
 * /operator/members/connectors shows real connectors with real dollars.
 *
 * Dev-only (DEV_USER_IDS) and LOCAL dev only — it shells out to the project's
 * verified tsx seed scripts rather than re-implementing them (one source of truth,
 * no port drift). Both scripts are idempotent.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId || !ALLOWED.includes(userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tsx = 'node_modules/.bin/tsx';
  try {
    const { stdout } = await execAsync(
      `${tsx} prisma/seed-demo.ts && ${tsx} scripts/seed-gravity-ledger.ts`,
      { cwd: process.cwd(), env: process.env, maxBuffer: 16 * 1024 * 1024 },
    );
    return NextResponse.json({ success: true, log: stdout.slice(-1500) });
  } catch (e) {
    console.error('[seed-gravity-ledger] seed failed', e);
    const detail =
      (e as { stderr?: string })?.stderr?.slice(-800) ||
      (e instanceof Error ? e.message : 'Seed failed');
    return NextResponse.json({ error: 'Seed failed', detail }, { status: 500 });
  }
}
