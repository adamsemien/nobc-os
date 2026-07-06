/** Person-centric CRM spine (Phase 2A) — the ONE place a Person row is born.
 *
 * Person is the universal base record: every human the platform touches gets
 * one from first contact (applicants who never submit, guests, operators,
 * sponsor staff, members). Membership is a profile ON a Person
 * (Member.personId); psychographics stay in MemberPsychographics on the
 * Member side of the sponsor firewall and never reach Person.
 *
 * IDENTITY POLICY (locked at Gate 1 review — do not soften):
 *   1. clerkUserId match = authoritative link.
 *   2. VERIFIED email match = link (identity-provider-proven addresses only:
 *      Clerk verified emails via the webhook or the claim flow).
 *   3. An UNVERIFIED email NEVER links to an existing Person. Anything typed
 *      into a form — by an applicant OR an operator — mints a NEW Person and,
 *      when the email collides with an existing Person, flags the pair via
 *      potentialDuplicateOfId for the 2B merge queue. Rationale: matching on
 *      unverified email would let anyone attach themselves to another
 *      person's record by typing their address.
 *   4. Phone matches only when neither clerk id nor email is present
 *      (SMS-only contacts; the event stream wires this later).
 *
 * Duplicates on (workspaceId, email) are therefore legitimate until 2B merge —
 * the DB index on email is deliberately NON-unique. (workspaceId, clerkUserId)
 * stays unique; concurrent mints on it are P2002-recovered like resolveMember.
 */
import { Prisma } from '@prisma/client';
import type { ContactRole, ContactSourceSystem, Person } from '@prisma/client';
import { db } from '@/lib/db';

export type ResolvePersonInput = {
  workspaceId: string;
  /** Real Clerk user id only — placeholder ids (guest:/manual:/…) are stripped. */
  clerkUserId?: string | null;
  /** Normalized to lowercase before match/write. */
  email?: string | null;
  /** true ONLY when the address was proven by an identity provider. */
  emailVerified?: boolean;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** CRM roles to union onto the Person (same vocabulary as Member.roles). */
  roles?: ContactRole[];
  /** Provenance: which system this touch came from (ContactSource row). */
  source: ContactSourceSystem;
  sourceExternalId?: string | null;
};

/** Synthetic clerkUserId prefixes minted by member-creation paths without a
 *  real Clerk account (see lib/auth.ts PLACEHOLDER_PREFIXES + mcp/comp/seed).
 *  These must never be treated as identity keys on Person. */
const PLACEHOLDER_CLERK_ID = /^(app_|applicant:|guest:|manual:|mcp:|comp:|user_DEMOSEED)/;

/** Returns the id when it is a real Clerk user id, null for placeholders. */
export function realClerkUserId(clerkUserId: string | null | undefined): string | null {
  if (!clerkUserId) return null;
  return PLACEHOLDER_CLERK_ID.test(clerkUserId) ? null : clerkUserId;
}

/** Map a resolveMember() free-form source label onto ContactSource provenance. */
export function contactSourceFromResolveSource(source: string): ContactSourceSystem {
  if (source.startsWith('apply_event') || source.endsWith('rsvp') || source === 'plus_one') {
    return 'event';
  }
  if (source.startsWith('apply') || source === 'approval') {
    return 'application';
  }
  return 'operator';
}

/**
 * Resolve (find-or-create) the canonical Person for a first touch. Never
 * throws on provenance bookkeeping; throws only when the mint itself fails.
 */
export async function resolvePerson(input: ResolvePersonInput): Promise<Person> {
  const { workspaceId } = input;
  const clerkUserId = realClerkUserId(input.clerkUserId);
  const email = input.email?.trim().toLowerCase() || null;
  const emailVerified = input.emailVerified === true;
  const phone = input.phone?.trim() || null;

  // 1. clerkUserId — authoritative.
  if (clerkUserId) {
    const byClerk = await db.person.findUnique({
      where: { workspaceId_clerkUserId: { workspaceId, clerkUserId } },
    });
    if (byClerk) {
      const canonical = await followMergedInto(byClerk);
      return enrich(canonical, { ...input, email, phone }, { emailVerified });
    }
  }

  // 2. VERIFIED email — links (and stamps the proven state).
  if (email && emailVerified) {
    const byEmail = await findCanonicalByEmail(workspaceId, email);
    if (byEmail) {
      return enrich(byEmail, { ...input, email, phone }, { emailVerified: true, stampClerkUserId: clerkUserId });
    }
  }

  // 3. UNVERIFIED email — never links. Flag a colliding pair for the 2B merge queue.
  let potentialDuplicateOfId: string | null = null;
  if (email && !emailVerified) {
    const collision = await findCanonicalByEmail(workspaceId, email);
    if (collision) potentialDuplicateOfId = collision.id;
  }

  // 4. Phone — weak key, only when nothing stronger was supplied.
  if (!clerkUserId && !email && phone) {
    const byPhone = await db.person.findFirst({
      where: { workspaceId, phone, mergedIntoId: null },
      orderBy: { createdAt: 'asc' },
    });
    if (byPhone) return enrich(byPhone, { ...input, email, phone }, {});
  }

  // 5. Mint.
  try {
    const created = await db.person.create({
      data: {
        workspaceId,
        clerkUserId,
        email,
        emailVerified: email ? emailVerified : false,
        phone,
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        roles: input.roles ?? [],
        potentialDuplicateOfId,
      },
    });
    await recordProvenance(created, input);
    return created;
  } catch (err) {
    // Concurrent mint on (workspaceId, clerkUserId) — re-resolve the winner.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && clerkUserId) {
      const raced = await db.person.findUnique({
        where: { workspaceId_clerkUserId: { workspaceId, clerkUserId } },
      });
      if (raced) {
        const canonical = await followMergedInto(raced);
        return enrich(canonical, { ...input, email, phone }, { emailVerified });
      }
    }
    console.error(
      `[resolvePerson] create failed (workspace=${workspaceId} source=${input.source}):`,
      err,
    );
    throw err;
  }
}

/** Oldest canonical (non-merged) Person matching the email, case-insensitive. */
async function findCanonicalByEmail(workspaceId: string, email: string): Promise<Person | null> {
  return db.person.findFirst({
    where: {
      workspaceId,
      email: { equals: email, mode: 'insensitive' },
      mergedIntoId: null,
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Follow a soft-merge pointer to the canonical record (capped against cycles). */
async function followMergedInto(person: Person): Promise<Person> {
  let current = person;
  for (let hops = 0; current.mergedIntoId && hops < 10; hops++) {
    const next = await db.person.findUnique({ where: { id: current.mergedIntoId } });
    if (!next) break;
    current = next;
  }
  return current;
}

/**
 * Fill missing identity fields on a matched Person (never overwrite a
 * differing non-null value), stamp verification/clerk id when proven, union
 * roles, and record provenance. Failures here degrade to the unenriched
 * person — a matched identity must not be lost to bookkeeping.
 */
async function enrich(
  person: Person,
  input: ResolvePersonInput & { email: string | null; phone: string | null },
  opts: { emailVerified?: boolean; stampClerkUserId?: string | null },
): Promise<Person> {
  try {
    const data: Prisma.PersonUncheckedUpdateInput = {};

    if (opts.stampClerkUserId && !person.clerkUserId) data.clerkUserId = opts.stampClerkUserId;
    if (input.email && !person.email) {
      data.email = input.email;
      data.emailVerified = opts.emailVerified === true;
    } else if (
      input.email &&
      person.email &&
      person.email.toLowerCase() === input.email &&
      opts.emailVerified === true &&
      !person.emailVerified
    ) {
      data.emailVerified = true;
    }
    if (input.phone && !person.phone) data.phone = input.phone;
    if (input.firstName?.trim() && !person.firstName) data.firstName = input.firstName.trim();
    if (input.lastName?.trim() && !person.lastName) data.lastName = input.lastName.trim();
    if (input.roles?.length) {
      const merged = Array.from(new Set([...person.roles, ...input.roles]));
      if (merged.length !== person.roles.length) data.roles = merged;
    }

    let updated = person;
    if (Object.keys(data).length > 0) {
      updated = await db.person.update({ where: { id: person.id }, data });
    }
    await recordProvenance(updated, input);
    return updated;
  } catch (err) {
    // P2002 here means another Person already holds the clerk id being stamped —
    // extremely rare (claim/webhook race); keep the match, skip the stamp.
    console.error(`[resolvePerson] enrich failed (person=${person.id}):`, err);
    return person;
  }
}

/** Upsert the (workspace, person, source) provenance row. Never throws. */
async function recordProvenance(person: Person, input: ResolvePersonInput): Promise<void> {
  try {
    await db.contactSource.upsert({
      where: {
        workspaceId_personId_source: {
          workspaceId: person.workspaceId,
          personId: person.id,
          source: input.source,
        },
      },
      create: {
        workspaceId: person.workspaceId,
        personId: person.id,
        source: input.source,
        externalId: input.sourceExternalId ?? person.email,
        syncStatus: 'active',
      },
      update: { lastSyncedAt: new Date() },
    });
  } catch (err) {
    console.error(`[resolvePerson] provenance upsert failed (person=${person.id}):`, err);
  }
}
