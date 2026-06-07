/**
 * Member data-access layer (member-intelligence PR3, client plumbing). Framework-agnostic
 * typed fetchers + query-key factory + a pure optimistic-merge helper. This is the layer
 * PR3's UI consumes; the TanStack Query hooks are a thin wrapper over these (see
 * _context/16-member-intelligence/AWAY-SESSION-NOTES.md for the drop-in hook code, parked
 * pending the @tanstack/react-query dependency decision).
 *
 * Kept dependency-free and pure so it is unit-testable and so adding TanStack later is
 * additive — no behavior here changes.
 */
import type { MemberRecord } from './member-record';
import type { ProvenanceSource } from './intelligence/sponsor-safe';
import { applyFieldWrites, type FieldWrite } from './member-provenance';

/** Stable query keys (TanStack-compatible tuples) so cache reads/invalidations agree. */
export const memberKeys = {
  all: ['member'] as const,
  record: (id: string, limit?: number) =>
    (limit ? (['member', id, 'record', { limit }] as const) : (['member', id, 'record'] as const)),
};

export class MemberApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MemberApiError';
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // non-JSON error body — keep the status text.
    }
    throw new MemberApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

/** GET the full operator-facing member record. */
export async function fetchMemberRecord(
  id: string,
  opts?: { limit?: number; signal?: AbortSignal },
): Promise<MemberRecord> {
  const qs = opts?.limit ? `?limit=${opts.limit}` : '';
  const res = await fetch(`/api/operator/members/${encodeURIComponent(id)}/record${qs}`, {
    signal: opts?.signal,
  });
  return jsonOrThrow<MemberRecord>(res);
}

export type FieldWriteInput = {
  value: string | number | boolean | null | string[];
  source?: ProvenanceSource;
  confidence?: number;
};

export interface PatchMemberResult {
  member: { id: string; customFields: Record<string, unknown> | null; fieldProvenance: Record<string, unknown> | null };
}

/** PATCH member dimension fields; the server stamps provenance. */
export async function patchMemberFields(
  id: string,
  fields: Record<string, FieldWriteInput>,
): Promise<PatchMemberResult> {
  const res = await fetch(`/api/operator/members/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return jsonOrThrow<PatchMemberResult>(res);
}

/**
 * Pure optimistic update: given the current record + pending field writes, return the next
 * record so a UI can render new values before the server confirms. Reuses the SAME stamping
 * as the server (applyFieldWrites) so the optimistic state matches the confirmed one. Source
 * defaults to operator_entered (the inline-edit case). Never mutates its input.
 */
export function optimisticApplyFieldWrites(
  record: MemberRecord,
  fields: Record<string, FieldWriteInput>,
  syncedAt: string,
): MemberRecord {
  const writes: Record<string, FieldWrite> = {};
  for (const [key, f] of Object.entries(fields)) {
    writes[key] = { value: f.value, source: f.source ?? 'operator_entered', confidence: f.confidence };
  }
  const { customFields, fieldProvenance } = applyFieldWrites({
    customFields: record.customFields,
    fieldProvenance: record.fieldProvenance,
    writes,
    syncedAt,
  });
  return { ...record, customFields, fieldProvenance };
}
