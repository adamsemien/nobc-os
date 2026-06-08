/**
 * Member field-edit policy (member-intelligence PR3 Slice 2, F4 + F5). The single
 * source of truth for WHICH member fields an operator may edit inline, and which keys
 * are reserved (firewall) or read-only (login identity / computed rollups). Shared by
 * the PATCH write-path, the FieldDefinition CRUD route, and the inline-edit UI so the
 * client never offers an affordance the server would reject.
 *
 * Pure + dependency-free so the classification is unit-testable in isolation.
 */

/**
 * First-class Member columns an operator may edit inline (the Profile card). These are
 * real scalar columns on Member — a write lands on the column itself, with provenance
 * stamped into fieldProvenance[key] alongside it. Deliberately excludes identity
 * (firstName/lastName/phone live in the header) and the firewalled income field.
 */
export const EDITABLE_MEMBER_COLUMNS = [
  'industry',
  'jobFunction',
  'seniority',
  'companySize',
  'companyName',
  'companyDomain',
  'linkedinUrl',
  'instagram',
  'city',
  'country',
  'ageRange',
  'aiSummary',
] as const;

/**
 * Firewall keys. NEVER editable on the operator surface and NEVER a valid custom-field
 * stableKey — archetype/psychographic data lives only in the MemberPsychographics table.
 * Rejected by both the PATCH write-path and the FieldDefinition CRUD route.
 */
export const RESERVED_FIELD_KEYS = [
  'archetype',
  'archetypeScores',
  'archetypeAverages',
  'interests',
  'tasteSignals',
  'psychographics',
] as const;

/**
 * Member columns that exist but must NOT be edited through the inline path:
 *  - email — login identity; changing it needs a guarded Clerk change-flow (not built).
 *  - computed / rollup values — editing would desync them from their source of truth.
 *  - lifecycle / system columns — owned by the funnel + approval gate, not free-text edits.
 *  - identity (firstName/lastName/phone) + householdIncome — out of scope this slice.
 * Listed explicitly so a write to a real column never silently shadows it as a customField.
 */
export const READONLY_MEMBER_KEYS = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'householdIncome',
  'status',
  'approved',
  'approvedAt',
  'redListed',
  'mergedIntoId',
  'mergedAt',
  'memberQrCode',
  'walletPassId',
  'passIssuedAt',
  'clerkUserId',
  'tags',
  'totalEventsAttended',
  'lastAttendedDate',
  'energyScore',
  'networkValueScore',
  'networkCapitalScore',
  'referredByMemberId',
  'enrichmentStatus',
  'enrichmentLastSynced',
  'createdAt',
  'updatedAt',
] as const;

export type FieldKeyClass = 'reserved' | 'readonly' | 'column' | 'custom';

export function isReservedKey(key: string): boolean {
  return (RESERVED_FIELD_KEYS as readonly string[]).includes(key);
}

export function isReadOnlyMemberKey(key: string): boolean {
  return (READONLY_MEMBER_KEYS as readonly string[]).includes(key);
}

export function isEditableColumn(key: string): boolean {
  return (EDITABLE_MEMBER_COLUMNS as readonly string[]).includes(key);
}

/**
 * Classify a target field key:
 *  - `reserved` → hard-reject (firewall).
 *  - `readonly` → reject (identity / computed / system column).
 *  - `column`   → write to the first-class Member column + stamp provenance.
 *  - `custom`   → operator-defined customFields entry (FieldDefinition-backed).
 */
export function classifyFieldKey(key: string): FieldKeyClass {
  if (isReservedKey(key)) return 'reserved';
  if (isReadOnlyMemberKey(key)) return 'readonly';
  if (isEditableColumn(key)) return 'column';
  return 'custom';
}

/** Slugify a label into a stable, queryable customField key (no reserved collisions). */
export function slugifyFieldKey(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 50) || 'field'
  );
}
