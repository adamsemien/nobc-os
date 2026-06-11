/** CSV connector — parse an operator-uploaded CSV into NormalizedContact[].
 *
 *  Pure + dependency-free (no DB, no CSV library). The ingestion pipeline — added
 *  later, gated on the Contact-spine schema — persists what this returns and does
 *  identity resolution. This file only parses + maps + normalizes. */
import type { ContactRole, NormalizedContact } from '../types';
import { normalizeEmail, normalizeInstagram, normalizePhone, splitName } from '../normalize';

/** Parse CSV text into rows of string cells. RFC 4180-ish: handles quoted fields,
 *  embedded commas/quotes/newlines, doubled-quote (`""`) escapes, CRLF or LF
 *  records, and a leading UTF-8 BOM. */
export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++; // swallow CR; the following LF (or EOF) ends the record
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush a trailing field/row that wasn't terminated by a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Header aliases in canonical form (lowercased, alphanumeric only).
const HEADER_ALIASES: Record<string, string[]> = {
  email: ['email', 'emailaddress', 'mail', 'emailaddr'],
  firstName: ['firstname', 'first', 'fname', 'givenname'],
  lastName: ['lastname', 'last', 'lname', 'surname', 'familyname'],
  fullName: ['name', 'fullname', 'contactname', 'contact'],
  phone: ['phone', 'phonenumber', 'mobile', 'cell', 'tel', 'telephone'],
  instagram: ['instagram', 'ig', 'ighandle', 'instagramhandle', 'insta'],
  company: ['company', 'organization', 'organisation', 'org', 'companyname'],
  website: ['website', 'url', 'site', 'web'],
  tags: ['tags', 'labels', 'tag'],
  id: ['id', 'externalid'],
};

function canonHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Map each known field to the first matching column index. */
function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const canon = canonHeader(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && aliases.includes(canon)) map[field] = idx;
    }
  });
  return map;
}

export type CsvParseOptions = {
  /** Role hint applied to every imported contact (e.g. `lead` for a prospect list).
   *  Left unset when the operator hasn't declared one. */
  defaultRole?: ContactRole;
  /** Injectable for deterministic tests. */
  fetchedAt?: Date;
};

export type CsvParseResult = {
  contacts: NormalizedContact[];
  /** Data rows considered (excludes the header row). */
  totalRows: number;
  /** Rows dropped, with a reason (1-based row number incl. header). */
  skipped: { row: number; reason: string }[];
  /** Which logical field mapped to which column index. */
  headerMap: Record<string, number>;
  /** Headers that didn't match any known field (surfaced so the operator can see
   *  what was ignored). */
  unmappedHeaders: string[];
};

/** Parse + map a CSV into NormalizedContact[]. A row needs at least one identity
 *  key (email / phone / instagram) or a name to survive; otherwise it's skipped
 *  with a reason. */
export function csvToNormalizedContacts(text: string, opts: CsvParseOptions = {}): CsvParseResult {
  const fetchedAt = opts.fetchedAt ?? new Date();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { contacts: [], totalRows: 0, skipped: [], headerMap: {}, unmappedHeaders: [] };
  }

  const headers = rows[0];
  const headerMap = buildHeaderMap(headers);
  const mappedIdx = new Set(Object.values(headerMap));
  const unmappedHeaders = headers
    .filter((_, i) => !mappedIdx.has(i))
    .map((h) => h.trim())
    .filter(Boolean);

  const contacts: NormalizedContact[] = [];
  const skipped: { row: number; reason: string }[] = [];
  let totalRows = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => c.trim() === '')) continue; // ignore blank lines
    totalRows++;

    const get = (field: string): string | undefined => {
      const idx = headerMap[field];
      if (idx === undefined) return undefined;
      return cells[idx]?.trim() || undefined;
    };

    const { email, emailRaw } = normalizeEmail(get('email'));
    let firstName = get('firstName');
    let lastName = get('lastName');
    if (!firstName && !lastName) {
      const split = splitName(get('fullName'));
      firstName = split.firstName;
      lastName = split.lastName;
    }
    const phone = normalizePhone(get('phone'));
    const instagram = normalizeInstagram(get('instagram'));

    if (!email && !phone && !instagram && !firstName && !lastName) {
      skipped.push({ row: r + 1, reason: 'no email, phone, instagram, or name' });
      continue;
    }

    const tagsRaw = get('tags');
    const tags = tagsRaw
      ? tagsRaw
          .split(/[;,|]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const company = get('company');
    const website = get('website');
    // Stable-ish external id for ContactSource dedup: explicit id → email →
    // phone → row position (last resort; unstable across re-orders).
    const externalId = get('id') ?? email ?? (phone ? `phone:${phone}` : `row:${r}`);

    const rawSnapshot: Record<string, string> = {};
    headers.forEach((h, i) => {
      rawSnapshot[h.trim()] = cells[i] ?? '';
    });

    contacts.push({
      source: 'csv',
      externalId,
      email,
      emailRaw,
      phone,
      firstName,
      lastName,
      instagram,
      website,
      roleHint: opts.defaultRole,
      tags: tags && tags.length > 0 ? tags : undefined,
      enrichment: company ? { companyName: company } : undefined,
      rawSnapshot,
      sourceFetchedAt: fetchedAt,
    });
  }

  return { contacts, totalRows, skipped, headerMap, unmappedHeaders };
}
