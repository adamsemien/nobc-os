/**
 * Per-field provenance (member-intelligence PR2). Every operator/enrichment write to
 * a member dimension field stamps `fieldProvenance[key] = { value, source, confidence,
 * syncedAt }` alongside the value in `customFields[key]`. Sponsor aggregates later draw
 * only from `self_reported` + `verified_enrichment` and never from `ai_inferred`.
 *
 * This module is pure + DB-free so the stamping logic is unit-testable in isolation;
 * the PATCH route reads the current JSON blobs, applies these writes, and persists.
 */
import { z } from 'zod';
import type { ProvenanceSource } from './intelligence/sponsor-safe';

/** Source-of-truth union, kept in lockstep with ProvenanceSource in sponsor-safe.ts. */
export const PROVENANCE_SOURCES = [
  'self_reported',
  'operator_entered',
  'ai_inferred',
  'verified_enrichment',
  'producer',
] as const;

export const provenanceSourceSchema = z.enum(PROVENANCE_SOURCES);

// Compile-time check that the Zod enum and the TS union never drift.
type _SourcesMatch = [ProvenanceSource] extends [(typeof PROVENANCE_SOURCES)[number]]
  ? [(typeof PROVENANCE_SOURCES)[number]] extends [ProvenanceSource]
    ? true
    : never
  : never;
const _sourcesMatch: _SourcesMatch = true;
void _sourcesMatch;

/** A dimension value — scalar or string list, matching FieldDefinition.type options.
 *  Deliberately not an arbitrary object: keeps customFields JSONB clean + queryable. */
const jsonFieldValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

const fieldWriteSchema = z.object({
  value: jsonFieldValue,
  source: provenanceSourceSchema.default('operator_entered'),
  confidence: z.number().min(0).max(1).optional(),
});

/** PATCH /api/operator/members/[id] body: a map of stableKey → field write. */
export const patchMemberSchema = z
  .object({
    fields: z.record(z.string().min(1).max(120), fieldWriteSchema),
  })
  .refine((b) => Object.keys(b.fields).length > 0, { message: 'No fields to update' });

export type FieldWrite = { value: unknown; source: ProvenanceSource; confidence?: number };

export interface ProvenanceRecord {
  value: unknown;
  source: ProvenanceSource;
  confidence?: number;
  syncedAt: string;
}

type JsonObject = Record<string, unknown>;

/**
 * Pure merge. Given the member's current `customFields`/`fieldProvenance` blobs, a set
 * of validated writes, and a timestamp, return the next blobs. Never mutates its inputs;
 * unwritten keys are preserved exactly.
 */
export function applyFieldWrites(args: {
  customFields: JsonObject | null;
  fieldProvenance: JsonObject | null;
  writes: Record<string, FieldWrite>;
  syncedAt: string;
}): { customFields: JsonObject; fieldProvenance: JsonObject } {
  const customFields: JsonObject = { ...(args.customFields ?? {}) };
  const fieldProvenance: JsonObject = { ...(args.fieldProvenance ?? {}) };

  for (const [key, write] of Object.entries(args.writes)) {
    customFields[key] = write.value;
    const record: ProvenanceRecord = {
      value: write.value,
      source: write.source,
      syncedAt: args.syncedAt,
    };
    if (write.confidence !== undefined) record.confidence = write.confidence;
    fieldProvenance[key] = record;
  }

  return { customFields, fieldProvenance };
}
