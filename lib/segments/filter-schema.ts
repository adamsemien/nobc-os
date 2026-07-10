import { z } from 'zod';
import { ContactRole, ContactSourceSystem, MemberStatus } from '@prisma/client';

/** Shared by POST /api/operator/segments (create) and PATCH .../[id] (edit a
 *  DYNAMIC segment's filter) — one schema, not two copies that can drift.
 *  Mirrors SegmentFilterDefinition in lib/segments/evaluate.ts exactly. */
export const FilterDefinitionSchema = z
  .object({
    q: z.string().max(200).optional(),
    source: z.nativeEnum(ContactSourceSystem).optional(),
    verified: z.enum(['verified', 'unverified']).optional(),
    membership: z.enum(['member', 'none']).optional(),
    consent: z.enum(['subscribed', 'none']).optional(),
    role: z.nativeEnum(ContactRole).optional(),
    organizationId: z.string().optional(),
    membershipStatus: z.nativeEnum(MemberStatus).optional(),
    tagId: z.string().optional(),
    customField: z.object({ stableKey: z.string(), value: z.string() }).optional(),
    firmographic: z
      .object({
        field: z.enum([
          'industry',
          'jobFunction',
          'seniority',
          'companySize',
          'city',
          'country',
          'companyName',
        ]),
        value: z.string(),
      })
      .optional(),
    eventId: z.string().optional(),
    createdAfter: z.string().optional(),
    createdBefore: z.string().optional(),
  })
  .strict();
