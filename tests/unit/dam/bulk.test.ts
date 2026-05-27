import { describe, it, expect } from 'vitest';
import { parseBulkAction } from '@/lib/dam/bulk';

describe('parseBulkAction', () => {
  it('rejects missing/blank assetIds and bad bodies', () => {
    expect(parseBulkAction({ action: 'softDelete', assetIds: [] }).ok).toBe(false);
    expect(parseBulkAction(null).ok).toBe(false);
    expect(parseBulkAction({ action: 'softDelete' }).ok).toBe(false);
  });

  it('rejects an unknown action', () => {
    expect(parseBulkAction({ action: 'nuke', assetIds: ['a'] }).ok).toBe(false);
  });

  it('parses flagSelect with a boolean value', () => {
    expect(parseBulkAction({ action: 'flagSelect', assetIds: ['a'], value: true })).toMatchObject({
      ok: true,
      action: 'flagSelect',
      assetIds: ['a'],
      payload: { value: true },
    });
    expect(parseBulkAction({ action: 'flagSelect', assetIds: ['a'] }).ok).toBe(false);
  });

  it('requires non-empty tags[] for addTags', () => {
    expect(parseBulkAction({ action: 'addTags', assetIds: ['a'] }).ok).toBe(false);
    expect(parseBulkAction({ action: 'addTags', assetIds: ['a'], tags: ['  '] }).ok).toBe(false);
    expect(parseBulkAction({ action: 'addTags', assetIds: ['a'], tags: ['rooftop'] }).ok).toBe(true);
  });

  it('defaults move folderId to null', () => {
    expect(parseBulkAction({ action: 'move', assetIds: ['a'] })).toMatchObject({
      ok: true,
      payload: { folderId: null },
    });
  });

  it('requires orderedIds for reorder', () => {
    expect(parseBulkAction({ action: 'reorder', assetIds: ['a'] }).ok).toBe(false);
    expect(parseBulkAction({ action: 'reorder', assetIds: ['a'], orderedIds: ['a', 'b'] })).toMatchObject({
      ok: true,
      payload: { orderedIds: ['a', 'b'] },
    });
  });

  it('accepts the no-payload actions', () => {
    for (const action of ['softDelete', 'restore', 'permanentDelete']) {
      expect(parseBulkAction({ action, assetIds: ['a'] }).ok).toBe(true);
    }
  });
});
