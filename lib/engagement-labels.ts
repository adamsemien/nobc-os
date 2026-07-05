/**
 * Human labels for member engagement-event types (member-intelligence PR3, F2 timeline).
 * The timeline must NEVER render raw enum tokens — every MemberEngagementEventType maps to
 * an operator-readable phrase using locked product terminology (Event Access, Guest,
 * Comp Access — never "RSVP"). `tone` drives the timeline marker color via design tokens.
 *
 * Typed as Record<MemberEngagementEventType, …> so adding an enum value fails the build
 * until it has a label — the map can never silently fall out of date.
 */
import type { MemberEngagementEventType } from '@prisma/client';

export type EngagementTone = 'positive' | 'negative' | 'neutral' | 'info';

export interface EngagementMeta {
  label: string;
  tone: EngagementTone;
}

const ENGAGEMENT_META: Record<MemberEngagementEventType, EngagementMeta> = {
  rsvp_confirmed: { label: 'Confirmed Event Access', tone: 'positive' },
  rsvp_cancelled: { label: 'Cancelled Event Access', tone: 'negative' },
  checked_in: { label: 'Checked in', tone: 'positive' },
  waitlist_joined: { label: 'Joined the waitlist', tone: 'neutral' },
  waitlist_promoted: { label: 'Promoted from the waitlist', tone: 'positive' },
  application_submitted: { label: 'Submitted an application', tone: 'info' },
  newsletter_opened: { label: 'Opened a newsletter', tone: 'neutral' },
  sponsor_perk_clicked: { label: 'Clicked a sponsor perk', tone: 'neutral' },
  guest_created: { label: 'Added as a Guest', tone: 'info' },
  application_approved: { label: 'Application approved', tone: 'positive' },
  application_rejected: { label: 'Application declined', tone: 'negative' },
  comp_issued: { label: 'Comp Access issued', tone: 'info' },
  access_requested: { label: 'Requested Event Access', tone: 'neutral' },
  ticket_purchased: { label: 'Purchased a ticket', tone: 'positive' },
  plus_one_added: { label: 'Added a plus-one', tone: 'neutral' },
  referral_made: { label: 'Made a referral', tone: 'info' },
  enrichment_synced: { label: 'Profile enriched', tone: 'neutral' },
  merged: { label: 'Merged a duplicate record', tone: 'neutral' },
  // Consent floor (CRM substrate, Phase 1).
  channel_subscribed: { label: 'Subscribed to a channel', tone: 'positive' },
  channel_unsubscribed: { label: 'Unsubscribed from a channel', tone: 'negative' },
  suppression_added: { label: 'Added to the suppression list', tone: 'negative' },
  // Minimal RBAC (Phase 1.5) — operator role change (surfaces only when the
  // operator maps to a Member; otherwise it lives in the AuditEvent trail).
  role_changed: { label: 'Operator role changed', tone: 'neutral' },
};

/** Humanize an unrecognized token so the UI never shows a raw enum (e.g. new DB value). */
function humanizeToken(token: string): string {
  const cleaned = token.replace(/[_-]+/g, ' ').trim();
  if (!cleaned) return 'Activity';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function engagementMeta(eventType: string): EngagementMeta {
  return (
    ENGAGEMENT_META[eventType as MemberEngagementEventType] ?? {
      label: humanizeToken(eventType),
      tone: 'neutral',
    }
  );
}
