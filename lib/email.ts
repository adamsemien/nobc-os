/** Single entry point for templated transactional email.
 *
 *  Every email send in NoBC OS goes through `sendTemplatedEmail` so:
 *   - operators control copy via Settings → Communications (EmailTemplate rows)
 *   - the `enabled` flag silently no-ops disabled templates
 *   - sends are audited via `email.sent`
 *   - `from` is always locked to `team@thenobadcompany.com` (CLAUDE.md)
 */

import { db } from './db';
import { resend } from './resend';
import { DEFAULT_EMAIL_TEMPLATES } from './email-templates-defaults';

export type EmailVariables = Record<string, string | number | null | undefined>;

export type SendResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: 'disabled' | 'template_missing' | 'send_failed' | 'no_resend_key'; error?: string };

const FROM = 'The No Bad Company <team@thenobadcompany.com>';

/** One-off blast send (Stage 18) - the same locked FROM as every send in
 *  NoBC OS. No per-send auditEvent here: the Blast/BlastRecipient rows ARE
 *  the delivery record. Throws on provider errors so the blast engine's
 *  bounded retry can classify them (err.name / err.statusCode). */
export async function sendBlastEmail(args: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ id: string | null }> {
  const send = await resend.emails.send({
    from: FROM,
    to: [args.to],
    subject: args.subject,
    text: args.text,
  });
  if (send.error) {
    const err = new Error(send.error.message) as Error & { statusCode?: number };
    err.name = send.error.name;
    throw err;
  }
  return { id: send.data?.id ?? null };
}

/** Flatten {member: {firstName: 'X'}} → {'member.firstName': 'X'} so callers can
 *  pass nested objects too. */
function flatten(obj: Record<string, unknown>, prefix = ''): EmailVariables {
  const out: EmailVariables = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else if (v instanceof Date) {
      out[key] = v.toISOString();
    } else if (v == null) {
      out[key] = '';
    } else {
      out[key] = v as string | number;
    }
  }
  return out;
}

function interpolate(input: string, vars: EmailVariables): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9._]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

async function loadTemplate(workspaceId: string, key: string) {
  const row = await db.emailTemplate.findUnique({
    where: { workspaceId_key: { workspaceId, key } },
    select: { id: true, key: true, subject: true, bodyHtml: true, bodyText: true, enabled: true },
  });
  if (row) return row;

  // Fallback to in-code default — preserves "send works on day 0 before operator
  // visits Settings." Operator's Communications page seeds rows on first view.
  const fallback = DEFAULT_EMAIL_TEMPLATES.find((t) => t.key === key);
  if (!fallback) return null;
  return {
    id: 'default',
    key: fallback.key,
    subject: fallback.subject,
    bodyHtml: fallback.bodyHtml,
    bodyText: fallback.bodyText,
    enabled: fallback.enabled,
  };
}

export async function sendTemplatedEmail(
  workspaceId: string,
  templateKey: string,
  to: string | string[],
  variables: Record<string, unknown> = {},
): Promise<SendResult> {
  const tpl = await loadTemplate(workspaceId, templateKey);
  if (!tpl) return { ok: false, reason: 'template_missing' };
  if (!tpl.enabled) return { ok: false, reason: 'disabled' };

  const flat = flatten(variables);
  const subject = interpolate(tpl.subject, flat);
  const html = interpolate(tpl.bodyHtml, flat);
  const text = interpolate(tpl.bodyText, flat);

  const recipients = Array.isArray(to) ? to : [to];

  if (!process.env.RESEND_API_KEY) {
    // In dev/CI without a key, fail soft — record the would-send so operators can
    // verify wiring from the audit log.
    await db.auditEvent.create({
      data: {
        workspaceId,
        action: 'email.skipped',
        entityType: 'EMAIL',
        entityId: tpl.id,
        metadata: { templateKey, reason: 'no_resend_key', recipientCount: recipients.length },
      },
    }).catch(() => {});
    return { ok: false, reason: 'no_resend_key' };
  }

  try {
    const send = await resend.emails.send({
      from: FROM,
      to: recipients,
      subject,
      html,
      text,
    });
    await db.auditEvent.create({
      data: {
        workspaceId,
        action: 'email.sent',
        entityType: 'EMAIL',
        entityId: tpl.id,
        metadata: {
          templateKey,
          recipientCount: recipients.length,
          subject,
          messageId: send.data?.id ?? null,
        },
      },
    }).catch(() => {});
    return { ok: true, messageId: send.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.auditEvent.create({
      data: {
        workspaceId,
        action: 'email.failed',
        entityType: 'EMAIL',
        entityId: tpl.id,
        metadata: { templateKey, recipientCount: recipients.length, error: message.slice(0, 200) },
      },
    }).catch(() => {});
    return { ok: false, reason: 'send_failed', error: message };
  }
}

/** Read a workspace platform setting as a string. */
export async function getPlatformSetting(workspaceId: string, key: string): Promise<string | null> {
  const row = await db.platformSetting.findUnique({
    where: { workspaceId_key: { workspaceId, key } },
    select: { value: true },
  });
  return row?.value ?? null;
}

export async function getPlatformBool(workspaceId: string, key: string, fallback: boolean): Promise<boolean> {
  const v = await getPlatformSetting(workspaceId, key);
  if (v == null) return fallback;
  return v === 'true' || v === '1';
}
