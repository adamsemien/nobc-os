'use client';

/** Attendee messages (Stage 18, 4D): compose -> check the guest list (the
 *  mandatory dry run) -> confirm with honest counts -> send. ADMIN only -
 *  the API routes are the boundary; this surface renders the 403 honestly.
 *  Editing the message after a check clears it: a stale confirmation can
 *  never fire (the server enforces the same rule by count).
 */
import { useEffect, useState } from 'react';

type Channel = 'EMAIL' | 'SMS';

type Verdict = {
  rsvpId: string;
  name: string;
  destination: string | null;
  status: string;
  consentSource: string | null;
  reason: string | null;
};

type DryRun = {
  enabled: boolean;
  reason?: string;
  verdicts?: Verdict[];
  counts?: { total: number; queued: number };
  confirmSentence?: string;
  consentBasis?: string;
};

const fieldClass =
  'w-full rounded border border-border bg-card px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary';

function verdictLabel(status: string): string {
  const map: Record<string, string> = {
    QUEUED: 'Will receive',
    SKIPPED_NO_CONSENT: 'Skipped - no consent',
    SKIPPED_SUPPRESSED: 'Skipped - do-not-contact',
    SKIPPED_NO_DESTINATION: 'Skipped - unreachable',
  };
  return map[status] ?? status;
}

export function EventMessagesTab({ eventId }: { eventId: string }) {
  const [access, setAccess] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [channel, setChannel] = useState<Channel>('EMAIL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'send' | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/operator/events/${eventId}/blast`);
      if (cancelled) return;
      if (res.status === 401 || res.status === 403) {
        setAccess('denied');
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as { smsEnabled?: boolean };
        setSmsEnabled(Boolean(data.smsEnabled));
      }
      setAccess('ok');
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Any compose change invalidates the checked list.
  function editCompose(update: () => void) {
    update();
    setDryRun(null);
    setClientToken(null);
    setResult(null);
    setError(null);
  }

  async function runCheck() {
    setBusy('check');
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/operator/events/${eventId}/blast/dry-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const data = (await res.json()) as DryRun & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'The check failed');
      setDryRun(data);
      setClientToken(crypto.randomUUID());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check failed');
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!dryRun?.counts || !clientToken) return;
    setBusy('send');
    setError(null);
    try {
      const res = await fetch(`/api/operator/events/${eventId}/blast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          ...(channel === 'EMAIL' ? { subject } : {}),
          body,
          confirm: true,
          expectedRecipients: dryRun.counts.queued,
          clientToken,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        sent?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? 'The send failed');
      setResult(
        `Sent to ${data.sent ?? 0} guest${(data.sent ?? 0) === 1 ? '' : 's'}.` +
          (data.failed ? ` ${data.failed} failed - see the event log.` : ''),
      );
      setDryRun(null);
      setClientToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The send failed');
    } finally {
      setBusy(null);
    }
  }

  if (access === 'loading') {
    return <p className="py-4 text-sm text-text-secondary">Loading…</p>;
  }
  if (access === 'denied') {
    return (
      <p className="py-4 text-sm text-text-secondary">
        Attendee messages need admin access.
      </p>
    );
  }

  const composeReady =
    body.trim().length > 0 && (channel === 'SMS' || subject.trim().length > 0);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">Message attendees</h2>
        <p className="mt-1 text-sm text-text-secondary">
          One message to this event&apos;s confirmed guests. Check the guest list
          first - the check shows exactly who can receive it and why anyone is
          skipped.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {result ? (
        <p role="status" className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {result}
        </p>
      ) : null}

      <div className="space-y-3 rounded-lg border border-border bg-surface-elevated p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Channel</span>
          <select
            value={channel}
            onChange={(e) => editCompose(() => setChannel(e.target.value as Channel))}
            className={fieldClass}
          >
            <option value="EMAIL">Email</option>
            <option value="SMS" disabled={!smsEnabled}>
              {smsEnabled ? 'Text message' : 'Text message - not set up yet'}
            </option>
          </select>
        </label>
        {channel === 'SMS' && !smsEnabled ? (
          <p className="text-xs text-text-tertiary">
            Text blasts need the marketing number configured
            (MARKETING_TWILIO_PHONE_NUMBER).
          </p>
        ) : null}

        {channel === 'EMAIL' ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Subject</span>
            <input
              type="text"
              value={subject}
              maxLength={200}
              onChange={(e) => editCompose(() => setSubject(e.target.value))}
              className={fieldClass}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">Message</span>
          <textarea
            value={body}
            rows={5}
            maxLength={2000}
            onChange={(e) => editCompose(() => setBody(e.target.value))}
            className={fieldClass}
          />
        </label>
        {channel === 'SMS' ? (
          <p className="text-xs text-text-tertiary">
            &quot;Reply STOP to opt out.&quot; is added automatically when your message
            doesn&apos;t include a STOP notice. Texts go only to guests who opted in
            on their application or member profile.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={busy !== null || !composeReady || (channel === 'SMS' && !smsEnabled)}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
        >
          {busy === 'check' ? 'Checking…' : 'Check the guest list'}
        </button>
      </div>

      {dryRun?.enabled && dryRun.verdicts && dryRun.counts ? (
        <div className="space-y-3 rounded-lg border border-border bg-surface-elevated p-4">
          <p className="text-sm font-medium text-text-primary">{dryRun.confirmSentence}</p>
          {dryRun.consentBasis ? (
            <p className="text-xs text-text-tertiary">{dryRun.consentBasis}</p>
          ) : null}
          <div className="max-h-64 overflow-y-auto rounded border border-border">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {dryRun.verdicts.map((v) => (
                  <tr key={v.rsvpId}>
                    <td className="px-3 py-2 text-text-primary">{v.name}</td>
                    <td className="px-3 py-2 text-xs text-text-muted">
                      {v.destination ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <span
                        className={
                          v.status === 'QUEUED'
                            ? 'text-emerald-700'
                            : 'text-text-muted'
                        }
                      >
                        {verdictLabel(v.status)}
                        {v.reason ? ` (${v.reason.toLowerCase()})` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy !== null || dryRun.counts.queued === 0}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
          >
            {busy === 'send'
              ? 'Sending…'
              : `Send to ${dryRun.counts.queued} guest${dryRun.counts.queued === 1 ? '' : 's'}`}
          </button>
        </div>
      ) : null}
      {dryRun && !dryRun.enabled ? (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {dryRun.reason}
        </p>
      ) : null}
    </div>
  );
}
