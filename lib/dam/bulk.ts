export type BulkAction =
  | { action: 'flagSelect'; assetIds: string[]; payload: { value: boolean } }
  | { action: 'addTags'; assetIds: string[]; payload: { tags: string[] } }
  | { action: 'move'; assetIds: string[]; payload: { folderId: string | null } }
  | { action: 'softDelete'; assetIds: string[]; payload: Record<string, never> }
  | { action: 'restore'; assetIds: string[]; payload: Record<string, never> }
  | { action: 'permanentDelete'; assetIds: string[]; payload: Record<string, never> }
  | { action: 'reorder'; assetIds: string[]; payload: { orderedIds: string[] } };

export type ParseResult = ({ ok: true } & BulkAction) | { ok: false; error: string };

const ACTIONS = [
  'flagSelect',
  'addTags',
  'move',
  'softDelete',
  'restore',
  'permanentDelete',
  'reorder',
] as const;

/** Validate + narrow a bulk-action request body. Pure — no DB, unit-testable. */
export function parseBulkAction(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid body' };
  const b = body as Record<string, unknown>;
  const action = b.action;
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, error: 'Unknown action' };
  }
  const assetIds = Array.isArray(b.assetIds)
    ? b.assetIds.filter((x): x is string => typeof x === 'string')
    : [];
  if (assetIds.length === 0) return { ok: false, error: 'assetIds required' };

  switch (action) {
    case 'flagSelect':
      if (typeof b.value !== 'boolean') return { ok: false, error: 'value (boolean) required' };
      return { ok: true, action, assetIds, payload: { value: b.value } };
    case 'addTags': {
      const tags = Array.isArray(b.tags)
        ? b.tags.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : [];
      if (tags.length === 0) return { ok: false, error: 'tags[] required' };
      return { ok: true, action, assetIds, payload: { tags } };
    }
    case 'move':
      return {
        ok: true,
        action,
        assetIds,
        payload: { folderId: typeof b.folderId === 'string' ? b.folderId : null },
      };
    case 'reorder': {
      const orderedIds = Array.isArray(b.orderedIds)
        ? b.orderedIds.filter((x): x is string => typeof x === 'string')
        : [];
      if (orderedIds.length === 0) return { ok: false, error: 'orderedIds required' };
      return { ok: true, action, assetIds, payload: { orderedIds } };
    }
    case 'softDelete':
    case 'restore':
    case 'permanentDelete':
      return { ok: true, action, assetIds, payload: {} };
    default:
      return { ok: false, error: 'Unknown action' };
  }
}
