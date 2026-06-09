import type { ResolvedAccess } from '@/lib/event-access';

/** Shared date/time formatting + warm access copy for the event templates.
 *  Extracted so Split / Editorial / Minimal stay consistent and DRY. */

export function parseDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

type DateLineOpts = {
  weekday?: 'short' | 'long';
  month?: 'short' | 'long';
  year?: boolean;
};

/** "FRI · 6 JUN · 2026" by default; tune weekday/month length + year per template. */
export function formatDateLine(d: Date, opts: DateLineOpts = {}): string {
  const { weekday = 'short', month = 'short', year = true } = opts;
  const wd = new Intl.DateTimeFormat('en-GB', { weekday }).format(d).toUpperCase();
  const day = d.getDate();
  const mon = new Intl.DateTimeFormat('en-GB', { month }).format(d).toUpperCase();
  return year ? `${wd} · ${day} ${mon} · ${d.getFullYear()}` : `${wd} · ${day} ${mon}`;
}

export function formatTimeLine(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export type WarmClosedCopy = {
  eyebrow: string;
  body: string;
  invite?: string;
  showApply: boolean;
};

/** Warm, invitation-style copy for a closed access state — replaces the
 *  clinical "THIS EVENT IS OPEN TO MEMBERS ONLY". Members-only closures get a
 *  gentle Apply nudge; other closures stay graceful without a CTA. */
export function warmClosedCopy(
  resolved: Extract<ResolvedAccess, { kind: ‘closed’ }>,
): WarmClosedCopy {
  if (/passed/i.test(resolved.reason)) {
    return {
      eyebrow: ‘This gathering has passed’,
      body: "Thanks to everyone who came. See what’s next on the calendar.",
      showApply: false,
    };
  }
  if (/member/i.test(resolved.reason)) {
    return {
      eyebrow: ‘By membership’,
      body: ‘This gathering is open to No Bad Company members.’,
      invite: ‘Not a member yet?’,
      showApply: true,
    };
  }
  return {
    eyebrow: ‘By invitation’,
    body: "This gathering isn’t open for registration right now.",
    showApply: false,
  };
}
