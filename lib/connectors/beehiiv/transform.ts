/** Map a beehiiv subscription → the connector-neutral NormalizedContact.
 *
 *  beehiiv has no native name/phone/Instagram fields — those live in custom_fields
 *  (when the publication collects them and expand[]=custom_fields was requested), so
 *  we pull identity keys from there. Every subscriber gets roleHint `subscriber`. */
import type { NormalizedContact } from '../types';
import { normalizeEmail, splitName, normalizePhone, normalizeInstagram } from '../normalize';
import type { BeehiivSubscription, BeehiivCustomField } from './types';

/** Case-insensitive lookup over custom_fields, returning the first non-empty value
 *  for any of the candidate names. */
function customFieldLookup(fields: BeehiivCustomField[] | undefined) {
  const map = new Map<string, string>();
  for (const f of fields ?? []) {
    if (!f?.name) continue;
    const v = f.value;
    if (v === null || v === undefined || v === '') continue;
    map.set(f.name.trim().toLowerCase(), String(v).trim());
  }
  return (...names: string[]): string | undefined => {
    for (const n of names) {
      const hit = map.get(n.toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  };
}

export function subscriptionToNormalizedContact(
  sub: BeehiivSubscription,
  fetchedAt: Date = new Date(),
): NormalizedContact {
  const cf = customFieldLookup(sub.custom_fields);

  const { email, emailRaw } = normalizeEmail(sub.email);

  // Names: explicit first/last custom fields, else split a single "name" field.
  let firstName = cf('first name', 'first', 'first_name', 'fname');
  let lastName = cf('last name', 'last', 'last_name', 'lname');
  if (!firstName && !lastName) {
    const split = splitName(cf('name', 'full name', 'full_name'));
    firstName = split.firstName;
    lastName = split.lastName;
  }

  const phone = normalizePhone(cf('phone', 'phone number', 'phone_number', 'mobile'));
  const instagram = normalizeInstagram(cf('instagram', 'instagram handle', 'ig', 'insta'));

  return {
    source: 'beehiiv',
    externalId: sub.id,
    email,
    emailRaw,
    phone,
    instagram,
    firstName,
    lastName,
    roleHint: 'subscriber',
    tags: sub.tags && sub.tags.length > 0 ? sub.tags : undefined,
    enrichment: {
      status: sub.status,
      subscriptionTier: sub.subscription_tier,
      utmSource: sub.utm_source,
      referringSite: sub.referring_site,
      createdAt: sub.created,
    },
    rawSnapshot: sub,
    sourceFetchedAt: fetchedAt,
  };
}
