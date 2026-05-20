import type { ReactNode } from 'react';

export type Tone =
  | 'neutral'
  | 'blue'
  | 'indigo'
  | 'success'
  | 'danger'
  | 'warning'
  | 'muted';

const TONE_STYLES: Record<Tone, { background: string; color: string; border: string; extra?: string }> = {
  neutral: {
    background: 'var(--muted)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border)',
  },
  blue: {
    background: 'var(--primary-soft, color-mix(in srgb, var(--primary) 10%, transparent))',
    color: 'var(--primary)',
    border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)',
  },
  indigo: {
    background: 'var(--primary-soft, color-mix(in srgb, var(--primary) 12%, transparent))',
    color: 'var(--primary)',
    border: '1px solid color-mix(in srgb, var(--primary) 40%, transparent)',
  },
  success: {
    background: 'var(--success-soft)',
    color: 'var(--success)',
    border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
  },
  danger: {
    background: 'var(--danger-soft)',
    color: 'var(--danger)',
    border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
  },
  warning: {
    background: 'var(--warning-soft)',
    color: 'var(--warning)',
    border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
  },
  muted: {
    background: 'var(--muted)',
    color: 'var(--text-tertiary, var(--text-muted))',
    border: '1px solid var(--border)',
    extra: 'line-through',
  },
};

export function StatusBadge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  const s = TONE_STYLES[tone];
  return (
    <span
      className="inline-flex items-center text-[10px] uppercase tracking-[0.06em] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
      title={title}
      style={{
        background: s.background,
        color: s.color,
        border: s.border,
        textDecoration: s.extra === 'line-through' ? 'line-through' : 'none',
      }}
    >
      {children}
    </span>
  );
}

// --- Domain → tone maps ---

export type ApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'WAITLIST'
  | 'HOLD'
  | string;

const APPLICATION_TONE: Record<string, Tone> = {
  PENDING: 'neutral',
  HOLD: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  WAITLIST: 'blue',
  WITHDRAWN: 'muted',
};

export function applicationTone(status: ApplicationStatus): Tone {
  return APPLICATION_TONE[status] ?? 'neutral';
}

export type RsvpStatus =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'WAITLIST'
  | 'NO_SHOW'
  | string;

const RSVP_TONE: Record<string, Tone> = {
  PENDING: 'neutral',
  PENDING_PAYMENT: 'warning',
  PENDING_APPROVAL: 'warning',
  CONFIRMED: 'success',
  CHECKED_IN: 'indigo',
  CANCELLED: 'muted',
  REFUNDED: 'muted',
  WAITLIST: 'blue',
  NO_SHOW: 'danger',
};

export function rsvpTone(status: RsvpStatus): Tone {
  return RSVP_TONE[status] ?? 'neutral';
}

export type EventStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'POSTPONED'
  | string;

const EVENT_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  CANCELLED: 'muted',
  COMPLETED: 'indigo',
  POSTPONED: 'warning',
};

export function eventTone(status: EventStatus): Tone {
  return EVENT_TONE[status] ?? 'neutral';
}

export type MemberStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'GUEST'
  | 'INACTIVE'
  | string;

const MEMBER_TONE: Record<string, Tone> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  GUEST: 'neutral',
  INACTIVE: 'muted',
};

export function memberTone(status: MemberStatus): Tone {
  return MEMBER_TONE[status] ?? 'neutral';
}

export type AiRecommendation =
  | 'strong_yes'
  | 'yes'
  | 'unclear'
  | 'no'
  | 'strong_no'
  | string
  | null
  | undefined;

const RECOMMENDATION_TONE: Record<string, Tone> = {
  strong_yes: 'success',
  yes: 'success',
  unclear: 'warning',
  no: 'danger',
  strong_no: 'danger',
};

export function recommendationTone(rec: AiRecommendation): Tone {
  if (!rec) return 'neutral';
  return RECOMMENDATION_TONE[rec] ?? 'neutral';
}
