/** Display helpers shared by the People surfaces (Phase 2A). Raw enum values
 *  never reach the UI — MemberStatus maps to canonical product language. */
import type { MemberStatus } from '@prisma/client';

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Member',
  REJECTED: 'Declined',
  WAITLISTED: 'Waitlisted',
  GUEST: 'Guest',
};

export type PersonDisplay = {
  label: string;
  /** true when neither a name nor an email exists — render muted/placeholder. */
  placeholder: boolean;
};

export function personDisplay(person: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): PersonDisplay {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  if (name) return { label: name, placeholder: false };
  if (person.email) return { label: person.email, placeholder: false };
  return { label: 'Unnamed person', placeholder: true };
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatCrmDate(date: Date): string {
  return DATE_FORMAT.format(date);
}
