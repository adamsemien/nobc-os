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

export function personDisplayName(person: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return name || person.email || person.phone || 'Unnamed person';
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatCrmDate(date: Date): string {
  return DATE_FORMAT.format(date);
}
