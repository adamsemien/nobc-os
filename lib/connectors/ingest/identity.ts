/** Identity resolution — the core of the CRM ingestion pipeline.
 *
 *  Pure + Prisma-free. Given a `NormalizedContact` from a connector and an in-memory
 *  index of existing contacts, it decides one of three outcomes:
 *
 *    • MATCH  — a single existing contact matched on a STRONG key (exact email).
 *               Safe to auto-attach the source + union roles/tags onto that contact.
 *    • REVIEW — only SOFT keys matched (phone / instagram), OR signals disagree
 *               (email points to one contact, phone to another), OR a soft key is
 *               ambiguous (matches several contacts). Never auto-attached — an
 *               operator confirms in the merge-review UI.
 *    • CREATE — nothing matched. A new contact. `identityKeyCount === 0` flags the
 *               identity-less "met in the wild" capture (no email/phone/ig) — it can
 *               never be deduped, so it is always a create.
 *
 *  The policy MIRRORS `lib/member-merge.ts` exactly — that module is the platform's
 *  canonical dedup law and ingestion must not drift from it:
 *    email_exact → auto-mergeable;  phone / instagram → operator-confirm only.
 *  Precedence is email > phone > instagram. Canonicalization matches member-merge's
 *  `normPhone` (strip to the 10 national digits) and `normInstagram` so an incoming
 *  record and an existing row compare identically across both layers.
 *
 *  The DB-touching half (build the index from a workspace-scoped query, then upsert
 *  Member/ContactSource from these decisions) is the persist adapter, added in the
 *  Contact-spine schema window. This file stays pure so it tests without the DB. */

import type { NormalizedContact } from '../types';

/** A strong (auto) or soft (confirm-only) match key. */
export type MatchKey = 'email_exact' | 'phone' | 'instagram';

/** One existing contact that an incoming record matched, and on which key. */
export type MatchHit = { contactId: string; key: MatchKey };

export type ReviewReason =
  /** Only phone/instagram matched (one contact) — soft signal, confirm before merge. */
  | 'soft_match'
  /** Strong key matched one contact, a soft key matched a DIFFERENT one — disagree. */
  | 'conflicting_identity'
  /** A soft key matched several distinct contacts — can't pick one automatically. */
  | 'ambiguous';

export type ResolutionDecision =
  | { kind: 'match'; contactId: string; matchedOn: 'email_exact' }
  | { kind: 'review'; reason: ReviewReason; candidates: MatchHit[] }
  | { kind: 'create'; provisionalId: string; identityKeyCount: number };

/** The identity tuple of an existing contact, as the pipeline will project it from
 *  the DB (one row per contact). Only the three match keys + the contact id. */
export type ContactIdentity = {
  contactId: string;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
};

/** Reverse indexes over existing contacts. Email is unique per workspace so it maps
 *  to a single id; phone/instagram may legitimately map to several (shared house
 *  line, agency handle), which is itself a review signal. */
export type ContactIndex = {
  byEmail: Map<string, string>;
  byPhone: Map<string, Set<string>>;
  byInstagram: Map<string, Set<string>>;
};

// ── Canonicalization (must match lib/member-merge.ts byte-for-byte) ──────────────

/** Lowercase + trim. Empty → undefined. */
export function canonicalEmail(raw: string | null | undefined): string | undefined {
  const t = raw?.trim().toLowerCase();
  return t || undefined;
}

/** Strip all separators and a leading country `1` → the 10 national digits.
 *  Mirrors member-merge `normPhone`. Anything that doesn't reduce to a usable key
 *  is still returned as its stripped digits (so two identical malformed values still
 *  match); empty → undefined. */
export function canonicalPhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const stripped = raw.replace(/[\s\-().+]/g, '').replace(/^1(\d{10})$/, '$1');
  return stripped || undefined;
}

/** Strip @, profile-URL wrapper, trailing slash/query; lowercase. Mirrors
 *  member-merge `normInstagram`. Empty → undefined. */
export function canonicalInstagram(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '');
  return t || undefined;
}

// ── Index construction ───────────────────────────────────────────────────────────

/** Build reverse indexes from existing contact identity tuples. Pure. */
export function buildContactIndex(rows: ContactIdentity[]): ContactIndex {
  const index: ContactIndex = {
    byEmail: new Map(),
    byPhone: new Map(),
    byInstagram: new Map(),
  };
  for (const row of rows) {
    addIdentityToIndex(index, row);
  }
  return index;
}

/** Insert one contact's keys into an index. Used by `buildContactIndex` and by
 *  `resolveBatch` to register provisional creates so later rows in the same batch
 *  dedup against earlier ones. */
export function addIdentityToIndex(index: ContactIndex, row: ContactIdentity): void {
  const email = canonicalEmail(row.email);
  const phone = canonicalPhone(row.phone);
  const instagram = canonicalInstagram(row.instagram);
  // Email is unique per workspace; first writer wins (don't clobber a real id).
  if (email && !index.byEmail.has(email)) index.byEmail.set(email, row.contactId);
  if (phone) addToSetMap(index.byPhone, phone, row.contactId);
  if (instagram) addToSetMap(index.byInstagram, instagram, row.contactId);
}

function addToSetMap(map: Map<string, Set<string>>, key: string, id: string): void {
  const set = map.get(key);
  if (set) set.add(id);
  else map.set(key, new Set([id]));
}

// ── Resolution ─────────────────────────────────────────────────────────────────

/** Resolve one incoming contact against the index. Pure — no mutation, no I/O. */
export function resolveContact(
  incoming: NormalizedContact,
  index: ContactIndex,
  provisionalId = 'provisional:0',
): ResolutionDecision {
  const email = canonicalEmail(incoming.email);
  const phone = canonicalPhone(incoming.phone);
  const instagram = canonicalInstagram(incoming.instagram);
  const identityKeyCount = (email ? 1 : 0) + (phone ? 1 : 0) + (instagram ? 1 : 0);

  const emailId = email ? index.byEmail.get(email) : undefined;
  const phoneIds = phone ? index.byPhone.get(phone) ?? new Set<string>() : new Set<string>();
  const igIds = instagram ? index.byInstagram.get(instagram) ?? new Set<string>() : new Set<string>();

  // Soft-matched ids (phone ∪ instagram), preserving which key found each.
  const softHits: MatchHit[] = [];
  for (const id of phoneIds) softHits.push({ contactId: id, key: 'phone' });
  for (const id of igIds) softHits.push({ contactId: id, key: 'instagram' });

  if (emailId) {
    // Strong key matched. If any soft key points to a DIFFERENT contact, the signals
    // disagree → don't auto-attach; surface every candidate for operator review.
    const conflicting = softHits.filter((h) => h.contactId !== emailId);
    if (conflicting.length > 0) {
      return {
        kind: 'review',
        reason: 'conflicting_identity',
        candidates: dedupeHits([{ contactId: emailId, key: 'email_exact' }, ...conflicting]),
      };
    }
    return { kind: 'match', contactId: emailId, matchedOn: 'email_exact' };
  }

  // No email match — fall back to soft signals.
  const distinctSoftIds = new Set(softHits.map((h) => h.contactId));
  if (distinctSoftIds.size === 1) {
    return { kind: 'review', reason: 'soft_match', candidates: dedupeHits(softHits) };
  }
  if (distinctSoftIds.size > 1) {
    return { kind: 'review', reason: 'ambiguous', candidates: dedupeHits(softHits) };
  }

  return { kind: 'create', provisionalId, identityKeyCount };
}

/** Collapse duplicate (contactId,key) hits; keep the strongest key per contact
 *  (email_exact > phone > instagram) so a contact matched on two keys lists once. */
function dedupeHits(hits: MatchHit[]): MatchHit[] {
  const rank: Record<MatchKey, number> = { email_exact: 0, phone: 1, instagram: 2 };
  const best = new Map<string, MatchKey>();
  for (const h of hits) {
    const cur = best.get(h.contactId);
    if (cur === undefined || rank[h.key] < rank[cur]) best.set(h.contactId, h.key);
  }
  return [...best.entries()].map(([contactId, key]) => ({ contactId, key }));
}

/** Resolve a whole batch, deduping WITHIN the batch too: a `create` registers its
 *  keys under a provisional id so a later row in the same batch resolves against it
 *  (two CSV rows for the same new person collapse instead of creating twice). The
 *  input index is not mutated — a working copy is threaded through. */
export function resolveBatch(
  incoming: NormalizedContact[],
  index: ContactIndex,
): ResolutionDecision[] {
  const working = cloneIndex(index);
  const decisions: ResolutionDecision[] = [];
  let seq = 0;
  for (const contact of incoming) {
    const provisionalId = `provisional:${seq}`;
    const decision = resolveContact(contact, working, provisionalId);
    if (decision.kind === 'create') {
      // Register the provisional contact so later rows can match/flag against it.
      addIdentityToIndex(working, {
        contactId: provisionalId,
        email: contact.email,
        phone: contact.phone,
        instagram: contact.instagram,
      });
      seq++;
    }
    decisions.push(decision);
  }
  return decisions;
}

function cloneIndex(index: ContactIndex): ContactIndex {
  return {
    byEmail: new Map(index.byEmail),
    byPhone: new Map([...index.byPhone].map(([k, v]) => [k, new Set(v)])),
    byInstagram: new Map([...index.byInstagram].map(([k, v]) => [k, new Set(v)])),
  };
}
