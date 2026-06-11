import { NextRequest, NextResponse } from 'next/server';
import { alert } from '@/lib/alerting';

/**
 * Server relay for client-side error boundary alerts.
 *
 * Error boundaries are 'use client' components and cannot call the alerting
 * dispatcher directly (no access to server-side env vars). They POST here;
 * this handler forwards to the dispatcher, which applies PII redaction.
 *
 * Intentionally unauthenticated — boundaries fire in crash states where
 * session context may be unavailable.
 *
 * Rate limit: per-IP fixed window, 5 requests per 60 s. Excess requests
 * return 200 {ok:true} silently — never 429 or 500, never fire an alert.
 * The limiter is in-process (module-level Map). It is per-instance and
 * best-effort: acceptable for a crash-relay that fires only on genuine errors,
 * not a security boundary. A restarted instance resets the window.
 */

// --- in-process per-IP rate limiter ---
const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_WINDOW = 5;

interface WindowEntry {
  count: number;
  resetAt: number;
}
const ipWindows = new Map<string, WindowEntry>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipWindows.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipWindows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}
// --------------------------------------

const MAX_MESSAGE_LENGTH = 500;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Resolve the forwarded IP (Vercel sets x-forwarded-for).
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isRateLimited(ip)) {
    // Fail quiet — never expose rate-limit status to crash clients.
    return NextResponse.json({ ok: true });
  }

  let body: { message?: string; digest?: string; boundary?: string };
  try {
    body = (await req.json()) as { message?: string; digest?: string; boundary?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Truncate message before passing to the dispatcher to prevent alert-body
  // bloat from pathologically long error messages.
  const rawMessage = body.message ?? 'unknown';
  const message =
    rawMessage.length > MAX_MESSAGE_LENGTH
      ? rawMessage.slice(0, MAX_MESSAGE_LENGTH) + '…'
      : rawMessage;

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
      message,
    },
  });

  return NextResponse.json({ ok: true });
}
