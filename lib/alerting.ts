/**
 * lib/alerting.ts
 *
 * Dependency-free Slack alert dispatcher.
 *
 * No-op until SLACK_ALERT_WEBHOOK_URL is set — mirrors the established
 * "code-complete, env-unset" pattern used by getSvix() and wallet-pass.ts.
 *
 * Rules:
 *  - Never throws. All errors are swallowed internally.
 *  - Never blocks the caller. Fire-and-forget via void (or awaited with a
 *    short AbortController timeout that swallows errors).
 *  - Never logs PII. A redaction guard strips any context key whose name
 *    matches the PII_KEYS pattern before the payload leaves this module.
 *  - Additive only — calling this never alters control flow in the caller.
 */

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

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: ':red_circle:',
  error: ':large_orange_circle:',
  warn: ':large_yellow_circle:',
};

function buildSlackMessage(payload: AlertPayload): string {
  const ts = new Date().toISOString();
  const emoji = SEVERITY_EMOJI[payload.severity];
  const ctx = payload.context ? redact(payload.context) : undefined;

  const lines: string[] = [
    `${emoji} *[${payload.severity.toUpperCase()}]* \`${payload.event}\``,
    `• *time:* ${ts}`,
  ];

  if (payload.workspaceId) {
    lines.push(`• *workspace:* \`${payload.workspaceId}\``);
  }

  if (ctx && Object.keys(ctx).length > 0) {
    lines.push('• *context:*');
    for (const [k, v] of Object.entries(ctx)) {
      lines.push(`  - \`${k}\`: ${String(v)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Fire-and-forget alert. Safe to call from any catch block without altering
 * the caller's control flow or response. Returns a Promise that always
 * resolves (never rejects).
 */
export async function alert(payload: AlertPayload): Promise<void> {
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    // No-op: env not set. Log locally so failures are visible in Vercel logs.
    console.error('[alerting] alert fired but SLACK_ALERT_WEBHOOK_URL is unset', {
      severity: payload.severity,
      event: payload.event,
      workspaceId: payload.workspaceId,
    });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: buildSlackMessage(payload) }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    // Swallow — a failed alert must never surface to the user.
    console.error('[alerting] failed to deliver alert', {
      severity: payload.severity,
      event: payload.event,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
