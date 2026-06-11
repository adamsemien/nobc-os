/** Shared normalization helpers for the CRM connectors. Pure + dependency-free.
 *  The ingestion pipeline does the heavier canonicalization (E.164 phone, fuzzy
 *  identity matching); these just clean a single source value at the adapter edge. */

/** Lowercase + trim an email. Returns `{}` for blank input. `emailRaw` keeps the
 *  original casing (for display); `email` is the normalized match key. */
export function normalizeEmail(raw: string | null | undefined): {
  email?: string;
  emailRaw?: string;
} {
  const emailRaw = raw?.trim() || undefined;
  return { email: emailRaw?.toLowerCase(), emailRaw };
}

/** Split "First Last" into parts. A single token is a first name; everything
 *  after the first space is the last name. */
export function splitName(full: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const trimmed = full?.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Light phone normalization: trim + collapse internal whitespace. The pipeline
 *  canonicalizes to E.164 — we don't pull a phone library at the adapter layer. */
export function normalizePhone(raw: string | null | undefined): string | undefined {
  const t = raw?.trim().replace(/\s+/g, ' ');
  return t || undefined;
}

/** Instagram handle: strip a profile-URL prefix and a leading `@`, lowercase. */
export function normalizeInstagram(raw: string | null | undefined): string | undefined {
  let t = raw?.trim();
  if (!t) return undefined;
  t = t
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
    .toLowerCase();
  return t || undefined;
}
