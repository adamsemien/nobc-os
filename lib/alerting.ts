/**
 * lib/alerting.ts
 *
 * Resend email alert dispatcher. Reuses lib/resend.ts singleton — no new
 * dependencies. No-op until RESEND_API_KEY is set, mirroring the established
 * "code-complete, env-unset" pattern used by getSvix() and wallet-pass.ts.
 *
 * Rules:
 *  - Never throws. All errors are swallowed internally.
 *  - Never blocks the caller. Fire-and-forget via void.
 *  - Never logs PII. A redaction guard strips any context key whose name
 *    matches the PII_KEYS pattern before the payload leaves this module.
 *  - Additive only — calling this never alters control flow in the caller.
 */

import { resend } from './resend';

export type AlertSeverity = 'critical' | 'error' | 'warn';

export interface AlertPayload {
  severity: AlertSeverity;
  /** Machine-readable event name, e.g. "stripe.payment_intent.failed" */
  event: string;
  workspaceId?: string;
  /** Extra context — PII keys are redacted automatically before sending. */
  context?: Record<string, unknown>;
}

// Keys whose values must never appear in alert payloads.
// Matched case-insensitively against the context object's keys.
const PII_KEYS = /email|phone|name|token|card|secret|password|ssn|dob|address/i;

function redact(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    out[k] = PII_KEYS.test(k) ? '[redacted]' : v;
  }
  return out;
}

const FROM = 'NoBC Alerts <team@thenobadcompany.com>';

function buildEmailBody(payload: AlertPayload): { subject: string; text: string } {
  const ts = new Date().toISOString();
  const ctx = payload.context ? redact(payload.context) : undefined;

  const subject = `[${payload.severity.toUpperCase()}] ${payload.event}`;

  const lines: string[] = [
    `severity: ${payload.severity.toUpperCase()}`,
    `event:    ${payload.event}`,
    `time:     ${ts}`,
  ];

  if (payload.workspaceId) {
    lines.push(`workspace: ${payload.workspaceId}`);
  }

  if (ctx && Object.keys(ctx).length > 0) {
    lines.push('');
    lines.push('context:');
    for (const [k, v] of Object.entries(ctx)) {
      lines.push(`  ${k}: ${String(v)}`);
    }
  }

  return { subject, text: lines.join('\n') };
}

/**
 * Fire-and-forget alert. Safe to call from any catch block without altering
 * the caller's control flow or response. Returns a Promise that always
 * resolves (never rejects).
 */
export async function alert(payload: AlertPayload): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    // No-op: env not set. Log locally so failures are visible in Vercel logs.
    console.error('[alerting] alert fired but RESEND_API_KEY is unset', {
      severity: payload.severity,
      event: payload.event,
      workspaceId: payload.workspaceId,
    });
    return;
  }

  const to = process.env.ALERT_EMAIL_TO ?? 'team@thenobadcompany.com';
  const { subject, text } = buildEmailBody(payload);

  try {
    await resend.emails.send({ from: FROM, to, subject, text });
  } catch (err) {
    // Swallow — a failed alert must never surface to the user.
    console.error('[alerting] failed to deliver alert', {
      severity: payload.severity,
      event: payload.event,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
