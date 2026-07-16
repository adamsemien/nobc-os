'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CommChannel, ConsentBasis, SubscriptionStatus, SuppressionReason } from '@prisma/client';

const CHANNEL_LABEL: Record<CommChannel, string> = { EMAIL: 'Email', SMS: 'SMS' };
const CHANNELS: CommChannel[] = ['EMAIL', 'SMS'];

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  SUBSCRIBED: 'Subscribed',
  UNSUBSCRIBED: 'Unsubscribed',
  PENDING: 'Pending',
  CLEANED: 'Cleaned',
  NEVER_SUBSCRIBED: 'Not subscribed',
};

const BASIS_LABEL: Record<ConsentBasis, string> = {
  EXPRESS_OPTIN: 'Express opt-in',
  EXPRESS_WRITTEN: 'Express written (opt-in page)',
  IMPLIED_RELATIONSHIP: 'Implied (relationship)',
  IMPORTED_LEGACY: 'Imported (legacy)',
  OPERATOR_ADDED: 'Operator added',
  UNKNOWN: 'Unknown',
};

const REASON_LABEL: Record<SuppressionReason, string> = {
  UNSUBSCRIBE: 'Unsubscribed',
  HARD_BOUNCE: 'Hard bounce',
  SPAM_COMPLAINT: 'Spam complaint',
  CARRIER_REJECT: 'Carrier reject',
  MANUAL_BLOCK: 'Manual block',
  GLOBAL_EXCLUDE: 'Global exclude',
  INVALID: 'Invalid',
};

export type PersonConsentState = {
  channel: CommChannel;
  status: SubscriptionStatus;
  consentBasis: ConsentBasis;
  consentSource: string | null;
};

export type PersonConsentSuppression = {
  channel: CommChannel;
  reason: SuppressionReason;
};

/** Person-capable consent write control (CRM spine Slice 0, detail parity Slice 1).
 *  Explicit operator action — can set Unsubscribed directly, unlike the
 *  signal-derived Member sync writer (lib/comms/consent-sync.ts), which never
 *  downgrades. Writes memberId: null, personId-keyed ChannelSubscription rows
 *  only.
 *
 *  Detail level (basis / source / suppression) now matches the read-only
 *  Member ConsentPanel (app/operator/members/_components/ConsentPanel.tsx) —
 *  by design that panel stays read-only in this slice; the write action here
 *  is a deliberate, pre-existing asymmetry from Slice 0, not something Slice 1
 *  extended to Member.
 *
 *  Known, deliberate gap (Slice 1 recon, unresolved by design): the
 *  COMMS_CONSENT_ENFORCEMENT shadow/enforce flag on lib/comms/can-send.ts
 *  currently gates nothing in the real send path. The attendee-messaging
 *  Blast engine (lib/blast/run.ts) decides who receives a message via a
 *  wholly separate mechanism — Member.marketingEmailOptIn /
 *  marketingSmsOptIn, through lib/blast/consent.ts — not canSend or
 *  ChannelSubscription. Reconciling Blast onto canSend so this panel's
 *  consent state is what actually gates sending was the original
 *  crm-substrate spec Phase-1 intent, but is real future work: it changes the
 *  live send path's blast radius and is out of scope for this slice. */
export function PersonConsentPanel({
  personId,
  subscriptions,
  suppressions,
  canEdit,
}: {
  personId: string;
  subscriptions: PersonConsentState[];
  suppressions: PersonConsentSuppression[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<CommChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Block is a harder action than Unsubscribe (it stops receipts and
  // reminders too), so it takes a two-step inline confirm per channel.
  const [confirmingBlock, setConfirmingBlock] = useState<CommChannel | null>(null);
  const subByChannel = new Map(subscriptions.map((s) => [s.channel, s]));
  const suppByChannel = new Map(suppressions.map((s) => [s.channel, s]));

  async function send(channel: CommChannel, body: Record<string, string>) {
    if (saving) return;
    setSaving(channel);
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}/consent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, ...body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not save consent.');
        return;
      }
      setConfirmingBlock(null);
      router.refresh();
    } catch {
      setError('Could not save consent.');
    } finally {
      setSaving(null);
    }
  }

  const setStatus = (channel: CommChannel, status: SubscriptionStatus) =>
    send(channel, { status });
  const block = (channel: CommChannel) => send(channel, { action: 'BLOCK' });

  return (
    <div>
      <ul className="space-y-2.5">
        {CHANNELS.map((channel) => {
          const sub = subByChannel.get(channel);
          const supp = suppByChannel.get(channel);
          const subscribed = sub?.status === 'SUBSCRIBED' && !supp;
          return (
            <li key={channel} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] text-text-primary">{CHANNEL_LABEL[channel]}</div>
                <div className="text-[11px] text-text-muted">
                  {sub ? BASIS_LABEL[sub.consentBasis] : 'Not recorded yet'}
                  {sub?.consentSource ? ` · ${sub.consentSource}` : ''}
                </div>
                {supp ? (
                  <div className="text-[11px] text-text-muted">
                    Suppressed · {REASON_LABEL[supp.reason]}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    'rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ' +
                    (subscribed ? 'font-medium text-text-primary' : 'text-text-muted')
                  }
                >
                  {supp ? 'Suppressed' : sub ? STATUS_LABEL[sub.status] : 'None'}
                </span>
                {canEdit && confirmingBlock !== channel ? (
                  <button
                    type="button"
                    disabled={saving === channel}
                    onClick={() => setStatus(channel, subscribed ? 'UNSUBSCRIBED' : 'SUBSCRIBED')}
                    className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-[12px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
                  >
                    {saving === channel ? 'Saving…' : subscribed ? 'Unsubscribe' : 'Subscribe'}
                  </button>
                ) : null}
                {canEdit && !supp ? (
                  confirmingBlock === channel ? (
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={saving === channel}
                        onClick={() => block(channel)}
                        className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium disabled:opacity-50"
                        style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                      >
                        {saving === channel ? 'Blocking…' : 'Confirm block'}
                      </button>
                      <button
                        type="button"
                        disabled={saving === channel}
                        onClick={() => setConfirmingBlock(null)}
                        className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-[12px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={saving === channel}
                      onClick={() => setConfirmingBlock(channel)}
                      className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-[12px] font-medium text-text-muted disabled:opacity-50"
                      style={{ color: 'var(--danger)' }}
                    >
                      Block
                    </button>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {confirmingBlock ? (
        <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
          Block stops everything on {CHANNEL_LABEL[confirmingBlock]} - receipts and reminders
          included. Unsubscribe only stops marketing.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
