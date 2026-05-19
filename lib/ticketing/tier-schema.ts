/** Zod schemas + converters shared by the ticket-tier API routes.
 *  The wire format uses ISO datetime strings; the lib layer wants Date objects. */
import { z } from 'zod';
import type { CreateTierInput, UpdateTierInput } from './tiers';

const tierFields = {
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  perksJson: z.any().optional(),
  memberPriceCents: z.number().int().nonnegative().optional().nullable(),
  nonMemberPriceCents: z.number().int().nonnegative().optional().nullable(),
  quantity: z.number().int().positive(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  visibility: z.enum(['public', 'secret_link', 'members_only']).optional(),
  autoOpenTrigger: z.enum(['previous_sold_out', 'date', 'manual']).optional().nullable(),
  previousTierId: z.string().min(1).optional().nullable(),
  minPerOrder: z.number().int().positive().optional(),
  maxPerOrder: z.number().int().positive().optional(),
  refundPolicy: z.enum(['none', 'window', 'credit']).optional().nullable(),
  refundWindowHours: z.number().int().nonnegative().optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
};

export const CreateTierSchema = z.object({
  eventId: z.string().min(1).optional(),
  seriesId: z.string().min(1).optional(),
  ...tierFields,
});

export const UpdateTierSchema = z.object(tierFields).partial();

export const ReorderTiersSchema = z.object({
  tierIds: z.array(z.string().min(1)),
});

function toDate(value: string | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? new Date(value) : value;
}

export function toCreateTierInput(data: z.infer<typeof CreateTierSchema>): CreateTierInput {
  return { ...data, startsAt: toDate(data.startsAt), endsAt: toDate(data.endsAt) };
}

export function toUpdateTierInput(data: z.infer<typeof UpdateTierSchema>): UpdateTierInput {
  return { ...data, startsAt: toDate(data.startsAt), endsAt: toDate(data.endsAt) };
}
