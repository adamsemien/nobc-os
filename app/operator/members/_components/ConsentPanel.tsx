import type {
  CommChannel,
  ConsentBasis,
  SubscriptionStatus,
  SuppressionReason,
} from '@prisma/client';

// Read-only Consent panel (CRM substrate, Phase 1). Shows the CHANNEL-axis consent
// state per channel from ChannelSubscription, plus any active suppressions. Display
// only — the action layer (unsubscribe / suppress) is a later phase. Until Phase 2
// backfills, most members show "Not recorded yet" / Pending. That is correct; this
// panel never synthesizes consent state (spec decision 5).

export type ConsentSubscription = {
  channel: CommChannel;
  status: SubscriptionStatus;
  consentBasis: ConsentBasis;
  consentSource: string | null;
  consentAt: Date | string | null;
};

export type ConsentSuppression = {
  channel: CommChannel;
  identifier: string;
  reason: SuppressionReason;
};

const CHANNEL_LABEL: Record<CommChannel, string> = { EMAIL: 'Email', SMS: 'SMS' };

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

const CHANNELS: CommChannel[] = ['EMAIL', 'SMS'];

export function ConsentPanel({
  subscriptions,
  suppressions,
}: {
  subscriptions: ConsentSubscription[];
  suppressions: ConsentSuppression[];
}) {
  const subByChannel = new Map(subscriptions.map((s) => [s.channel, s]));
  const suppByChannel = new Map(suppressions.map((s) => [s.channel, s]));

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        Consent
      </div>
      <ul className="mt-3 space-y-2.5">
        {CHANNELS.map((channel) => {
          const sub = subByChannel.get(channel);
          const supp = suppByChannel.get(channel);
          const subscribed = sub?.status === 'SUBSCRIBED' && !supp;
          return (
            <li key={channel} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-text-primary">{CHANNEL_LABEL[channel]}</div>
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
              <span
                className={
                  'shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ' +
                  (subscribed ? 'font-medium text-text-primary' : 'text-text-muted')
                }
              >
                {supp ? 'Suppressed' : sub ? STATUS_LABEL[sub.status] : 'None'}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
        Channel consent unifies as contacts are imported. Sending is gated by this
        record once enforcement is enabled.
      </p>
    </div>
  );
}
