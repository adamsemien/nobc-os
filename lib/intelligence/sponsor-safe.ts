/**
 * Sponsor firewall — the type boundary (member-intelligence PR2, S9).
 *
 * `SponsorAudienceMember` is the ONLY shape sponsor-facing code may use to describe
 * a member. It carries firmographic + coarse-demographic + provenance fields only.
 * Psychographic data (archetype, interests, tasteSignals) lives in the separate
 * `MemberPsychographics` table and is structurally absent here — the firewall is a
 * physical table boundary, this type is its compile-time enforcement.
 *
 * The `_SponsorSafe` guard below makes the rule a COMPILE error, not a convention:
 * if anyone ever adds a psychographic key to `SponsorAudienceMember`, the file stops
 * compiling. The companion source-scan in tests/unit/sponsor-firewall.test.ts catches
 * the runtime read paths (a sponsor module querying MemberPsychographics / archetype
 * scores). Together: structure + tests, not UI convention.
 */

/** Per-field provenance source. The single source-of-truth union; the PATCH write
 *  path validates against this same list. `ai_inferred` is never used in sponsor
 *  aggregates; `producer` is a write originating from the Producer app. */
export type ProvenanceSource =
  | 'self_reported'
  | 'operator_entered'
  | 'ai_inferred'
  | 'verified_enrichment'
  | 'producer';

export interface FieldProvenance {
  value: unknown;
  source: ProvenanceSource;
  confidence?: number;
  syncedAt: string;
}

/** Keys that must NEVER appear on a sponsor-visible member shape. */
type PsychographicKey =
  | 'archetype'
  | 'archetypeScores'
  | 'archetypeAverages'
  | 'interests'
  | 'tasteSignals'
  | 'psychographics';

/**
 * A single member as a sponsor may see them — firmographic + coarse demographic only.
 * No archetype, no interests, no taste signals, no raw `householdIncome`, no `aiSummary`.
 */
export interface SponsorAudienceMember {
  id: string;
  workspaceId: string;
  // Firmographic (sponsor-facing)
  industry: string | null;
  jobFunction: string | null;
  seniority: string | null;
  companySize: string | null;
  companyName: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  // Coarse demographic — geo + band only, never exact income/PII.
  city: string | null;
  country: string | null;
  ageRange: string | null;
  // Operator-defined custom fields, already filtered to FieldDefinition.sponsorVisible.
  customFields: Record<string, unknown> | null;
}

/**
 * Project any member-shaped object down to the sponsor-safe fields. Because it picks
 * an explicit field list, ANY psychographic field on the input (archetype, interests,
 * tasteSignals, a psychographics relation) is dropped — this is the runtime companion
 * to the compile-time guard, to be used wherever member data crosses into a sponsor
 * aggregation. The input type intentionally allows extra keys so callers can pass a
 * full Member without first stripping it.
 */
export function toSponsorAudienceMember(m: {
  id: string;
  workspaceId: string;
  industry?: string | null;
  jobFunction?: string | null;
  seniority?: string | null;
  companySize?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  linkedinUrl?: string | null;
  city?: string | null;
  country?: string | null;
  ageRange?: string | null;
  customFields?: Record<string, unknown> | null;
  [extra: string]: unknown;
}): SponsorAudienceMember {
  return {
    id: m.id,
    workspaceId: m.workspaceId,
    industry: m.industry ?? null,
    jobFunction: m.jobFunction ?? null,
    seniority: m.seniority ?? null,
    companySize: m.companySize ?? null,
    companyName: m.companyName ?? null,
    companyDomain: m.companyDomain ?? null,
    linkedinUrl: m.linkedinUrl ?? null,
    city: m.city ?? null,
    country: m.country ?? null,
    ageRange: m.ageRange ?? null,
    customFields: m.customFields ?? null,
  };
}

// ── Compile-time firewall assertion ─────────────────────────────────────────
// If `SponsorAudienceMember` ever grows a psychographic key, `Leaked` becomes a
// non-`never` union and the `Assert<...>` below fails to compile. This is the
// structural half of the firewall — it cannot be satisfied by a passing test alone.
type Assert<T extends true> = T;
type Leaked = Extract<keyof SponsorAudienceMember, PsychographicKey>;
export type _SponsorSafe = Assert<[Leaked] extends [never] ? true : false>;
