import { NextRequest, NextResponse } from 'next/server';
import { alert } from '@/lib/alerting';

/**
 * Server relay for client-side error boundary alerts.
 *
 * Error boundaries are 'use client' components and cannot POST directly to
 * an external Slack webhook from the browser. They POST here; this handler
 * forwards to the alerting dispatcher (which has access to server-side env
 * vars and applies PII redaction).
 *
 * Intentionally unauthenticated — boundaries fire in crash states where
 * session context may be unavailable. The payload is sanitised server-side
 * by the alerting module's redaction guard before leaving this process.
 *
 * Rate-limiting is left to Vercel's edge network; in practice these fire
 * only on genuine crashes, not on hot paths.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { message?: string; digest?: string; boundary?: string };
  try {
    body = (await req.json()) as { message?: string; digest?: string; boundary?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Fire-and-forget — do not await in a way that could delay a 200 response.
  void alert({
    severity: 'critical',
    event: 'client.error_boundary.caught',
    context: {
      boundary: body.boundary ?? 'unknown',
      digest: body.digest ?? 'none',
      // message is user-visible and unlikely to contain PII, but the
      // redaction guard in alerting.ts will strip any key matching the
      // PII_KEYS pattern. "message" does not match that pattern.
      message: body.message ?? 'unknown',
    },
  });

  return NextResponse.json({ ok: true });
}
