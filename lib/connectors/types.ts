/** Shared shapes for the CRM source connectors.
 *
 *  These are intentionally Prisma-free pure types so each adapter/client builds
 *  and unit-tests without the (not-yet-built) Contact-spine schema. The ingestion
 *  pipeline — added later, gated on the schema migration window — is the only
 *  place that maps a NormalizedContact onto a workspace-scoped Member/ContactSource
 *  row and performs identity resolution. Adapters never touch the DB. */

/** A source system a contact can be pulled from. Maps to the `TagSource` enum once
 *  the schema additively gains `producer`/`csv` values (future migration). */
export type ConnectorSource = 'beehiiv' | 'activecampaign' | 'producer' | 'csv';

/** A CRM role hint carried from the source. Roles are multi-valued and orthogonal
 *  to the membership lifecycle (`MemberStatus`) — see CRM-TERMINOLOGY-AND-ROLES.md.
 *  The pipeline resolves this hint onto the contact's role set; it is NOT a status. */
export type ContactRole =
  | 'member'
  | 'guest'
  | 'subscriber'
  | 'lead'
  | 'vendor'
  | 'sponsor_contact';

/** The stable internal shape every connector emits. The adapter is the only place
 *  that knows the source's wire format; the pipeline consumes this shape.
 *
 *  Note: there is deliberately NO `workspaceId` here. The destination workspace is
 *  ours and is stamped by the ingestion pipeline. A source record's own workspace id
 *  (e.g. Producer's) is a foreign id and lives only inside `rawSnapshot`/`enrichment`
 *  — using it as our workspace scope would be a tenant-isolation bug. */
export type NormalizedContact = {
  source: ConnectorSource;
  /** Stable identifier in the source system (→ ContactSource.externalId). */
  externalId: string;
  /** Normalized: lowercased + trimmed. */
  email?: string;
  /** Original casing, preserved as received. */
  emailRaw?: string;
  /** Lightly normalized; the pipeline canonicalizes to E.164. */
  phone?: string;
  /** Lowercased, no leading `@` — the third identity-match key after email/phone. */
  instagram?: string;
  firstName?: string;
  lastName?: string;
  website?: string;
  avatarUrl?: string;
  /** A role hint from the source (e.g. `vendor` for Producer). */
  roleHint?: ContactRole;
  /** Source-side tags to union-merge. */
  tags?: string[];
  /** Extra source fields preserved for enrichment/provenance display. */
  enrichment?: Record<string, unknown>;
  /** Full source record → ContactSource.rawSnapshot. */
  rawSnapshot: unknown;
  sourceFetchedAt: Date;
};
