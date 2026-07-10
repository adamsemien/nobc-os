'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CommChannel, SubscriptionStatus } from '@prisma/client';

const CHANNEL_LABEL: Record<CommChannel, string> = { EMAIL: 'Email', SMS: 'SMS' };
const CHANNELS: CommChannel[] = ['EMAIL', 'SMS'];

export type PersonConsentState = {
  channel: CommChannel;
  status: SubscriptionStatus;
};

/** Person-capable consent write control (CRM spine Slice 0). Explicit
 *  operator action — can set Unsubscribed directly, unlike the signal-derived
 *  Member sync writer (lib/comms/consent-sync.ts), which never downgrades.
 *  Writes memberId: null, personId-keyed ChannelSubscription rows only; the
 *  read-only Member ConsentPanel (app/operator/members/_components/ConsentPanel.tsx)
 *  is untouched. */
export function PersonConsentPanel({
  personId,
  subscriptions,
  canEdit,
}: {
  personId: string;
  subscriptions: PersonConsentState[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<CommChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byChannel = new Map(subscriptions.map((s) => [s.channel, s.status]));

  async function setStatus(channel: CommChannel, status: SubscriptionStatus) {
    if (saving) return;
    setSaving(channel);
    setError(null);
    try {
      const res = await fetch(`/api/operator/people/${personId}/consent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, status }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not save consent.');
        return;
      }
      router.refresh();
    } catch {
      setError('Could not save consent.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <ul className="space-y-2.5">
        {CHANNELS.map((channel) => {
          const status = byChannel.get(channel);
          const subscribed = status === 'SUBSCRIBED';
          return (
            <li key={channel} className="flex items-center justify-between gap-3">
              <div className="text-[13px] text-text-primary">{CHANNEL_LABEL[channel]}</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-muted">
                  {status ? (subscribed ? 'Subscribed' : 'Unsubscribed') : 'Not recorded'}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={saving === channel}
                    onClick={() => setStatus(channel, subscribed ? 'UNSUBSCRIBED' : 'SUBSCRIBED')}
                    className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-[12px] font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
                  >
                    {saving === channel ? 'Saving…' : subscribed ? 'Unsubscribe' : 'Subscribe'}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
