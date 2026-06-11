/** Wire shapes for Producer's CRM export — GET /api/crm-export/vendors.
 *
 *  Producer dropped its `Vendor` table in Phase B: a "vendor" is now a
 *  `DirectoryCompany` row with "Vendor" in its `roles[]` array (the same table
 *  also holds Sponsors/Partners/Venues/Agencies). The export filters to the Vendor
 *  role and returns this conservative field set — sensitive insurance/notes fields
 *  (policy number, certificate URL, internal notes, airtableCompanyId) are excluded
 *  on Producer's side. See _context/16-member-intelligence/crm-spine/PRODUCER-INTEGRATION-CONTRACT.md. */

export type ProducerVendor = {
  id: string;
  /** Producer's workspace id — a FOREIGN id, never used as our workspace scope. */
  workspaceId: string;
  name: string;
  roles: string[];
  type: string | null;
  category: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  logoUrl: string | null;
  insuranceVerified: boolean;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
};

/** Page envelope returned by the export. Ordering is stable on `(updatedAt, id)`;
 *  `nextCursor` is null on the final page. */
export type ProducerVendorsPage = {
  data: ProducerVendor[];
  nextCursor: string | null;
};
