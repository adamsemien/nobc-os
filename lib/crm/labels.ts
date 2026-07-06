/** Display strings for CRM enums (Phase 2A). UI copy law: raw enum values
 *  never reach the UI. Engagement-event labels live in lib/engagement-labels.ts
 *  (the exhaustive, tone-carrying map) — do not duplicate them here. */
import type { ContactRole, ContactSourceSystem, OrganizationKind } from '@prisma/client';

export const CONTACT_SOURCE_LABELS: Record<ContactSourceSystem, string> = {
  operator: 'Operator',
  beehiiv: 'Beehiiv',
  activecampaign: 'ActiveCampaign',
  producer: 'Producer',
  csv: 'CSV import',
  tenur: 'Tenur',
  clerk: 'Clerk account',
  application: 'Application',
  event: 'Event',
};

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  member: 'Member',
  guest: 'Guest',
  subscriber: 'Subscriber',
  lead: 'Lead',
  vendor: 'Vendor',
  sponsor_contact: 'Sponsor contact',
};

export const ORGANIZATION_KIND_LABELS: Record<OrganizationKind, string> = {
  sponsor: 'Sponsor',
  saas_prospect: 'SaaS prospect',
  member_company: 'Member company',
  vendor: 'Vendor',
  other: 'Other',
};

