import { NextResponse } from 'next/server';

/** Nightly cron — Intelligence insight generation.
 *
 *  SCAFFOLD ONLY. The per-workspace loop calling generateInsights() and the
 *  Claude narrative call land next session. Wire a Vercel cron schedule in
 *  vercel.json when activating. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    note: 'intelligence insight generation — scaffold only; activation deferred to next session',
  });
}
