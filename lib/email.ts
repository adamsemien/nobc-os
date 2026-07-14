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
import { flatten, interpolate } from './email-interpolate';

export type { EmailVariables } from './email-interpolate';

export type SendResult =
  | { ok: true; messageId?: string }
  | { ok: false; reason: 'disabled' | 'template_missing' | 'send_failed' | 'no_resend_key'; error?: string };

/** Per-recipient identity for TransactionalEmailLog (Slice 3). Optional and
 *  additive — omitting it entirely preserves prior sendTemplatedEmail behavior. */
export type EmailRecipientIdentity = { memberId?: string | null; personId?: string | null };

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

// flatten() + interpolate() moved verbatim to lib/email-interpolate.ts so the
// communications preview and this send path share ONE interpolator.

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

// Consent floor (CRM substrate, Phase 1) — BOUNDARY, deliberately NOT routed
// through canSend. sendTemplatedEmail carries TRANSACTIONAL lifecycle mail
// (welcome, approval, rejection, comp, receipts) which is consent-exempt and must
// never be muted by marketing consent — and it has no Member in scope (keyed by
// workspaceId + raw to-address). The MARKETING email path is the Blast
// (lib/blast/recipients.ts -> sendBlastEmail), which IS shadow-wired to canSend.
// TODO(enforcement): if a marketing-category templated send is ever added here,
// classify by templateKey and route only those through canSend — never the
// transactional keys. Do not blanket-gate this function.
export async function sendTemplatedEmail(
  workspaceId: string,
  templateKey: string,
  to: string | string[],
  variables: Record<string, unknown> = {},
  // Slice 3 (Communicate + log it) — optional, parallel to the normalized recipient
  // list (recipients[i] <-> identities[i]); missing/extra entries default to null.
  // Existing callers that omit this keep working exactly as before.
  identities?: (EmailRecipientIdentity | null)[],
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
    await logTransactionalEmail(workspaceId, templateKey, recipients, identities, send.data?.id ?? null, 'sent');
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
    await logTransactionalEmail(workspaceId, templateKey, recipients, identities, null, 'failed');
    return { ok: false, reason: 'send_failed', error: message };
  }
}

/** One TransactionalEmailLog row per recipient, per actually-attempted Resend call
 *  (Slice 3). Not written for the early-return paths above (disabled/template_missing/
 *  no_resend_key) — those never reach Resend, so there is no providerId a later
 *  webhook could ever match against; logging them would just be unmatchable noise
 *  in a table whose whole point is open/click tracking. Fire-and-forget, never
 *  throws — a lost log row must not turn an otherwise-successful send into a
 *  reported failure. */
async function logTransactionalEmail(
  workspaceId: string,
  templateKey: string,
  recipients: string[],
  identities: (EmailRecipientIdentity | null)[] | undefined,
  providerId: string | null,
  status: 'sent' | 'failed',
): Promise<void> {
  try {
    await db.transactionalEmailLog.createMany({
      data: recipients.map((to, i) => ({
        workspaceId,
        templateKey,
        to,
        memberId: identities?.[i]?.memberId ?? null,
        personId: identities?.[i]?.personId ?? null,
        providerId,
        status,
      })),
    });
  } catch (err) {
    console.error(`[email] logTransactionalEmail failed (template=${templateKey} workspace=${workspaceId}):`, err);
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
