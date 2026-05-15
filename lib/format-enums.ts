import type { MemberGate, GuestGate, CompType } from "./event-access-schema"

const ACCESS_MODE_LABELS: Record<string, string> = {
  OPEN: 'RSVP (Free)',
  TICKETED: 'Paid Ticket',
  APPLY_OR_PAY: 'Members Apply / Others Pay',
  APPLICATION_ONLY: 'Application Only',
  INVITE_ONLY: 'Invite Only',
};

const EVENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
};

const MEMBER_GATE_LABELS: Record<MemberGate, string> = {
  auto_confirm: 'Reserve My Spot',
  questions: 'Register with fields',
  questions_approval: 'Apply to Attend',
  pay: 'Ticketed',
  pay_questions: 'Ticketed, fields after',
  questions_pay: 'Fields, then ticketed',
  questions_pay_approval: 'Apply + ticketed',
};

const GUEST_GATE_LABELS: Record<GuestGate, string> = {
  pay: 'Ticketed',
  apply: 'Apply to Attend',
  pay_questions: 'Ticketed, fields after',
  questions_pay: 'Fields, then ticketed',
  apply_pay: 'Apply + ticketed',
  questions_approval: 'Apply to Attend',
};

const COMP_TYPE_LABELS: Record<CompType, string> = {
  sponsor: 'Sponsor',
  vendor: 'Vendor',
  staff: 'Staff',
  press: 'Press',
  partner: 'Partner',
  other: 'Other',
};

export function accessModeLabel(mode: string): string {
  return ACCESS_MODE_LABELS[mode.toUpperCase()] ?? mode;
}

export function eventStatusLabel(status: string): string {
  return EVENT_STATUS_LABELS[status.toUpperCase()] ?? status;
}

export function formatMemberGate(g: MemberGate): string {
  return MEMBER_GATE_LABELS[g] ?? g;
}

export function formatGuestGate(g: GuestGate): string {
  return GUEST_GATE_LABELS[g] ?? g;
}

export function formatCompType(c: CompType): string {
  return COMP_TYPE_LABELS[c] ?? c;
}
