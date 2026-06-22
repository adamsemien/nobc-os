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

  it('reorder: filters non-string entries from orderedIds', () => {
    // Mixed array — only string entries survive; the two strings pass validation
    const result = parseBulkAction({
      action: 'reorder',
      assetIds: ['a'],
      orderedIds: ['id-1', 42, null, 'id-2'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({ orderedIds: ['id-1', 'id-2'] });
    }
  });

  it('reorder: rejects when all orderedIds entries are non-string', () => {
    expect(
      parseBulkAction({ action: 'reorder', assetIds: ['a'], orderedIds: [1, null, true] }).ok,
    ).toBe(false);
  });

  // Wave 3 new actions -------------------------------------------------------

  describe('removeTags', () => {
    it('rejects missing tags array', () => {
      expect(parseBulkAction({ action: 'removeTags', assetIds: ['a'] }).ok).toBe(false);
    });

    it('rejects all-whitespace tags', () => {
      expect(
        parseBulkAction({ action: 'removeTags', assetIds: ['a'], tags: ['  ', ''] }).ok,
      ).toBe(false);
    });

    it('rejects empty tags array', () => {
      expect(parseBulkAction({ action: 'removeTags', assetIds: ['a'], tags: [] }).ok).toBe(false);
    });

    it('parses valid removeTags with correct payload', () => {
      const result = parseBulkAction({ action: 'removeTags', assetIds: ['a', 'b'], tags: ['outdoor', 'summer'] });
      expect(result).toMatchObject({
        ok: true,
        action: 'removeTags',
        assetIds: ['a', 'b'],
        payload: { tags: ['outdoor', 'summer'] },
      });
    });

    it('filters non-string entries from tags', () => {
      const result = parseBulkAction({ action: 'removeTags', assetIds: ['a'], tags: ['valid', 42, null] });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload).toEqual({ tags: ['valid'] });
    });
  });

  describe('setCredit', () => {
    it('rejects missing credit', () => {
      expect(parseBulkAction({ action: 'setCredit', assetIds: ['a'] }).ok).toBe(false);
    });

    it('rejects non-string credit', () => {
      expect(parseBulkAction({ action: 'setCredit', assetIds: ['a'], credit: 42 }).ok).toBe(false);
      expect(parseBulkAction({ action: 'setCredit', assetIds: ['a'], credit: null }).ok).toBe(false);
    });

    it('parses setCredit with a string value (including empty string)', () => {
      const result = parseBulkAction({ action: 'setCredit', assetIds: ['a'], credit: 'Jane Doe' });
      expect(result).toMatchObject({
        ok: true,
        action: 'setCredit',
        assetIds: ['a'],
        payload: { credit: 'Jane Doe' },
      });
    });

    it('accepts empty string credit (clearing a credit is valid)', () => {
      const result = parseBulkAction({ action: 'setCredit', assetIds: ['a'], credit: '' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload).toEqual({ credit: '' });
    });

    it('rejects empty assetIds', () => {
      expect(parseBulkAction({ action: 'setCredit', assetIds: [], credit: 'Jane' }).ok).toBe(false);
    });
  });

  describe('setSponsor', () => {
    it('rejects missing sponsor', () => {
      expect(parseBulkAction({ action: 'setSponsor', assetIds: ['a'] }).ok).toBe(false);
    });

    it('rejects non-string sponsor', () => {
      expect(parseBulkAction({ action: 'setSponsor', assetIds: ['a'], sponsor: true }).ok).toBe(false);
    });

    it('parses setSponsor with a string value', () => {
      const result = parseBulkAction({ action: 'setSponsor', assetIds: ['x'], sponsor: 'Acme Corp' });
      expect(result).toMatchObject({
        ok: true,
        action: 'setSponsor',
        assetIds: ['x'],
        payload: { sponsor: 'Acme Corp' },
      });
    });

    it('accepts empty string sponsor (clearing a sponsor is valid)', () => {
      const result = parseBulkAction({ action: 'setSponsor', assetIds: ['x'], sponsor: '' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload).toEqual({ sponsor: '' });
    });

    it('rejects empty assetIds', () => {
      expect(parseBulkAction({ action: 'setSponsor', assetIds: [], sponsor: 'Acme' }).ok).toBe(false);
    });
  });
});
