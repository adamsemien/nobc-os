/** Map an ActiveCampaign contact → the connector-neutral NormalizedContact.
 *  AC has native first/last/phone/email fields, so no custom-field mining is needed.
 *  Every contact gets roleHint `subscriber` (they're on the email audience). */
import type { NormalizedContact } from '../types';
import { normalizeEmail, normalizePhone } from '../normalize';
import type { ACContact } from './types';

/** AC returns placeholder strings ("", "0", "0000-00-00") for empty values. Treat
 *  those as absent. */
function clean(value: string | undefined): string | undefined {
  const t = value?.trim();
  if (!t || t === '0' || /^0000-00-00/.test(t)) return undefined;
  return t;
}

export function contactToNormalizedContact(
  c: ACContact,
  fetchedAt: Date = new Date(),
): NormalizedContact {
  const { email, emailRaw } = normalizeEmail(c.email);

  return {
    source: 'activecampaign',
    externalId: c.id,
    email,
    emailRaw,
    phone: normalizePhone(clean(c.phone)),
    firstName: clean(c.firstName),
    lastName: clean(c.lastName),
    roleHint: 'subscriber',
    enrichment: {
      createdAt: clean(c.cdate),
      updatedAt: clean(c.udate),
    },
    rawSnapshot: c,
    sourceFetchedAt: fetchedAt,
  };
}
