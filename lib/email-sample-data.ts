/** The ONE sample dataset for email preview + send-test.
 *
 *  Shared by the communications preview iframe and the send-test route so
 *  "preview = send" holds: both run the same data through the same
 *  interpolator (lib/email-interpolate.ts). Pure module, client-safe.
 *
 *  Keys mirror what production sends actually provide (see
 *  app/api/cron/event-reminders/route.ts for event.reminder) plus the
 *  broader documented variable set, so unresolved-token gaps show up as
 *  sample values in preview rather than silently as empty strings.
 */

import { flatten, type EmailVariables } from './email-interpolate';

export const SAMPLE_EMAIL_DATA = {
  member: {
    firstName: 'Jordan',
    lastName: 'Ellis',
  },
  event: {
    title: 'The Line',
    timeFormatted: '7:00 PM',
    dateFormatted: 'Friday, August 14',
    location: 'The Green Room',
    url: 'https://app.thenobadcompany.com/m/events',
  },
  site: {
    url: 'https://app.thenobadcompany.com',
  },
} as const;

/** Flat lookup ('member.firstName' → 'Jordan') for editor chips and previews. */
export const SAMPLE_EMAIL_DATA_FLAT: EmailVariables = flatten(SAMPLE_EMAIL_DATA);
