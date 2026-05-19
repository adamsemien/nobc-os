/** Zod schemas + converters shared by the event-series API routes.
 *  Wire format uses ISO datetime strings; the lib layer wants Date objects. */
import { z } from 'zod';
import type { CreateSeriesInput, UpdateSeriesInput } from './series';

const seriesFields = {
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional().nullable(),
  recurrenceRule: z.string().min(1).max(500),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  count: z.number().int().positive().optional().nullable(),
  defaultHeroImageAssetId: z.string().optional().nullable(),
  defaultDescription: z.string().max(2000).optional().nullable(),
  defaultAccessMode: z.enum(['OPEN', 'TICKETED', 'APPLY_OR_PAY']).optional(),
  defaultPlusOnesAllowed: z.boolean().optional(),
  defaultRefundPolicy: z.enum(['none', 'window', 'credit']).optional(),
  brandColorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  active: z.boolean().optional(),
};

export const CreateSeriesSchema = z.object(seriesFields);
export const UpdateSeriesSchema = z.object(seriesFields).partial();

function toDate(value: string | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? new Date(value) : value;
}

export function toCreateSeriesInput(data: z.infer<typeof CreateSeriesSchema>): CreateSeriesInput {
  return { ...data, startsAt: new Date(data.startsAt), endsAt: toDate(data.endsAt) };
}

export function toUpdateSeriesInput(data: z.infer<typeof UpdateSeriesSchema>): UpdateSeriesInput {
  return {
    ...data,
    startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
    endsAt: toDate(data.endsAt),
  };
}
