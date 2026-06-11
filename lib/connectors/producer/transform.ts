/** Map a Producer vendor record → the connector-neutral NormalizedContact. */
import type { NormalizedContact } from '../types';
import type { ProducerVendor } from './types';

/** Split "First Last" → { firstName, lastName }. A single token is a first name;
 *  everything after the first space is the last name. */
function splitName(full: string | null): { firstName?: string; lastName?: string } {
  const trimmed = full?.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Convert a Producer `DirectoryCompany`(Vendor) row into a NormalizedContact.
 *
 *  The destination workspace is NOT set here — the ingestion pipeline stamps our
 *  workspace. Producer's own `workspaceId` is preserved only inside `enrichment`
 *  (a foreign id, never our scope). `fetchedAt` is injectable for deterministic tests. */
export function vendorToNormalizedContact(
  v: ProducerVendor,
  fetchedAt: Date = new Date(),
): NormalizedContact {
  const emailRaw = v.contactEmail?.trim() || undefined;
  const { firstName, lastName } = splitName(v.contactName);

  return {
    source: 'producer',
    externalId: v.id,
    email: emailRaw?.toLowerCase(),
    emailRaw,
    phone: v.contactPhone?.trim() || undefined,
    firstName,
    lastName,
    website: v.website?.trim() || undefined,
    avatarUrl: v.logoUrl?.trim() || undefined,
    roleHint: 'vendor',
    tags: v.roles.length > 0 ? v.roles : undefined,
    enrichment: {
      companyName: v.name,
      type: v.type ?? undefined,
      category: v.category ?? undefined,
      insuranceVerified: v.insuranceVerified,
      producerWorkspaceId: v.workspaceId,
    },
    rawSnapshot: v,
    sourceFetchedAt: fetchedAt,
  };
}
