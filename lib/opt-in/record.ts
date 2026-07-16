import type { ConsentBindingMethod, PrismaClient } from '@prisma/client';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { db as defaultDb } from '@/lib/db';
import { writeConsent } from '@/lib/comms/consent-writer';
import { toE164 } from './phone';

/**
 * SMS opt-in recording (TCPA consent capture) — writes the immutable
 * ConsentArtifact evidence row, then routes the live state through THE single
 * consent writer (lib/comms/consent-writer.ts, unchanged). The artifact table
 * carries the defensible evidence (verbatim disclosure, IP, UA, URL, version);
 * ChannelSubscription stays the mutable live state.
 *
 * Person-keyed on purpose: writeConsent with personId mints/updates the
 * canonical memberId-null row — exactly what the segment consent filter reads
 * (lib/segments/evaluate.ts resolveFromPersons). The legacy stale-link
 * convergence gap in consent-sync and the Blast<->SuppressionEntry send-time
 * reconciliation are NAMED DEPENDENCIES, not fixed here.
 */

export type OptInBinding = 'token' | 'cold';

/** Pure, testable binding classification — evidence, never inference. */
export function classifyBinding(
  binding: OptInBinding,
  personStoredPhone: string | null,
  submittedE164: string,
): ConsentBindingMethod {
  if (binding === 'cold') return 'COLD';
  const storedE164 = toE164(personStoredPhone);
  return storedE164 === submittedE164 ? 'TOKEN_PHONE_MATCH' : 'TOKEN_PHONE_NEW';
}

export type RecordSmsOptInArgs = {
  workspaceId: string;
  /** The bound Person (Path A: token, merge pointer already followed; Path B: resolvePerson output). */
  person: { id: string; phone: string | null; potentialDuplicateOfId: string | null };
  binding: OptInBinding;
  /** Submitted phone, already normalized to E.164 via lib/opt-in/phone.ts. */
  e164: string;
  postalCode: string;
  consentAt: Date;
  ip: string;
  userAgent: string;
  disclosureText: string;
  disclosureVersion: string;
  formUrl: string;
};

export type RecordSmsOptInResult = {
  artifactId: string;
  bindingMethod: ConsentBindingMethod;
  /** The person-keyed subscription was already SUBSCRIBED before this act. */
  alreadySubscribed: boolean;
  /** A SuppressionEntry hard block exists for this number — consent is
   *  recorded, but delivery stays blocked until the subscriber texts START. */
  suppressed: boolean;
  /** A DIFFERENT existing Person already holds this number (merge-queue food). */
  phoneMatchedPersonId: string | null;
};

/** Exact stored-format candidates for the duplicate-phone lookup. Person.phone
 *  is historically un-normalized (trim-only writes), so match the formats the
 *  existing create paths actually store: E.164, bare national digits, and
 *  1-prefixed national digits. Punctuated legacy values ("(512) 555-1234")
 *  are missed — accepted: the merge queue is the net, this check is best-effort
 *  evidence, and false negatives here never mis-bind consent. */
function candidateStoredFormats(e164: string): string[] {
  const parsed = parsePhoneNumberFromString(e164);
  const national = parsed?.nationalNumber ? String(parsed.nationalNumber) : null;
  const formats = [e164];
  if (national) formats.push(national, `1${national}`);
  return formats;
}

export async function recordSmsOptIn(
  args: RecordSmsOptInArgs,
  db: PrismaClient = defaultDb,
): Promise<RecordSmsOptInResult> {
  const { workspaceId, person, e164 } = args;

  // A different unmerged Person already holding this number — record, never
  // silently pick (the consent stays bound to `person`).
  const phoneMatch = await db.person.findFirst({
    where: {
      workspaceId,
      id: { not: person.id },
      phone: { in: candidateStoredFormats(e164) },
      mergedIntoId: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const bindingMethod = classifyBinding(args.binding, person.phone, e164);

  // Pre-act state for the response copy (idempotent double opt-in UX).
  const existingSub = await db.channelSubscription.findFirst({
    where: { workspaceId, personId: person.id, memberId: null, channel: 'SMS', stream: '*' },
    select: { status: true },
  });
  const alreadySubscribed = existingSub?.status === 'SUBSCRIBED';

  // The evidence row — append-only, never updated (confirmedAt's stage-2
  // null->timestamp flip is the single exception, and it is not written here).
  const artifact = await db.consentArtifact.create({
    data: {
      workspaceId,
      personId: person.id,
      channel: 'SMS',
      phone: e164,
      postalCode: args.postalCode,
      consentAt: args.consentAt,
      ip: args.ip,
      userAgent: args.userAgent,
      disclosureText: args.disclosureText,
      disclosureVersion: args.disclosureVersion,
      formUrl: args.formUrl,
      bindingMethod,
      phoneMatchedPersonId: phoneMatch?.id ?? null,
    },
    select: { id: true },
  });

  // Non-fatal bookkeeping: duplicate flag (fill-if-empty, never clobber an
  // existing flag) + Person backfill (phone fill-if-empty; postalCode is
  // first-party live data — newest wins).
  try {
    const personData: { phone?: string; postalCode?: string; potentialDuplicateOfId?: string } = {
      postalCode: args.postalCode,
    };
    if (!person.phone) personData.phone = e164;
    if (phoneMatch && !person.potentialDuplicateOfId) {
      personData.potentialDuplicateOfId = phoneMatch.id;
    }
    await db.person.update({ where: { id: person.id }, data: personData });
  } catch (err) {
    console.error(`[sms-optin] person backfill failed (person=${person.id}):`, err);
  }

  // Live consent state through THE single writer. Explicit mode: a fresh
  // first-party signal — lawfully overrides a prior UNSUBSCRIBED.
  const linkedMember = await db.member.findFirst({
    where: { workspaceId, personId: person.id, mergedIntoId: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  await writeConsent(
    {
      workspaceId,
      personId: person.id,
      memberId: linkedMember?.id ?? null,
      signal: {
        channel: 'SMS',
        status: 'SUBSCRIBED',
        basis: 'EXPRESS_WRITTEN',
        source: `sms_optin_page:${args.disclosureVersion}`,
        at: args.consentAt,
      },
      mode: 'explicit',
      context: 'sms_optin',
    },
    db,
  );

  // Hard floor check — the SuppressionEntry table has no delete path, and a
  // carrier STOP requires the subscriber to text START before anything can
  // deliver. Consent is still recorded; the caller surfaces honest copy.
  const suppression = await db.suppressionEntry.findUnique({
    where: {
      workspaceId_channel_identifier: { workspaceId, channel: 'SMS', identifier: e164 },
    },
    select: { id: true },
  });

  return {
    artifactId: artifact.id,
    bindingMethod,
    alreadySubscribed,
    suppressed: suppression != null,
    phoneMatchedPersonId: phoneMatch?.id ?? null,
  };
}
