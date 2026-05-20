const ACCESS_MODE_LABELS: Record<string, string> = {
  OPEN: 'RSVP (Free)',
  TICKETED: 'Paid Ticket',
  TICKETED_APPROVAL: 'Ticketed + Approval Required',
  APPLICATION_ONLY: 'Application Only',
  INVITE_ONLY: 'Invite Only',
};

const EVENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
};

export function accessModeLabel(mode: string): string {
  return ACCESS_MODE_LABELS[mode.toUpperCase()] ?? mode;
}

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status.toUpperCase()] ?? status;
}
