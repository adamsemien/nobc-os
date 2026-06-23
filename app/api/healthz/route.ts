import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Liveness / readiness probe for uptime monitors. No auth, no PII. Returns 200
// when the app can reach Postgres, 503 otherwise — so a DB outage is detected,
// not just a dead process. Never cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  } catch (err) {
    console.error('[healthz] DB check failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ status: 'degraded', db: 'down' }, { status: 503 });
  }
}
