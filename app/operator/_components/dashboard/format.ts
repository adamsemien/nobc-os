/** Shared formatters for the operator home liquid-editorial layout. */

export function formatRelativeTime(iso: Date): string {
  const ms = Date.now() - iso.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function actionLabel(action: string): string {
  return action.replace(/_/g, ' ').replace(/\./g, ' › ');
}

/**
 * Audit-event tick color — token-only, themes correctly.
 * Green = approved/created member, gold = event changes, red = the rest.
 */
export function actionColor(action: string): string {
  if (action.startsWith('application.approved')) return 'var(--success)';
  if (action.startsWith('application.rejected')) return 'var(--danger)';
  if (action.startsWith('rsvp.refunded')) return 'var(--warning)';
  if (action.startsWith('event.')) return 'var(--warning)';
  if (action.startsWith('rsvp.confirmed') || action.startsWith('rsvp.checked_in')) return 'var(--primary)';
  return 'var(--text-tertiary)';
}
