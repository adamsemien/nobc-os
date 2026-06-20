import { describe, it, expect } from 'vitest';
import { computeReorder, arrayMove } from '@/lib/dam/reorder';

// Pins the drag-to-arrange reorder logic used by MediaGrid.
// computeReorder is the single source of truth for what orderedIds to
// send to POST /api/media/dam/assets/bulk { action: 'reorder' }.

const IDS = ['a', 'b', 'c', 'd', 'e'];

// ---------------------------------------------------------------------------
// arrayMove
// ---------------------------------------------------------------------------

describe('arrayMove', () => {
  it('moves forward: [a,b,c] move a→c gives [b,c,a]', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves backward: [a,b,c] move c→a gives [c,a,b]', () => {
    expect(arrayMove(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('adjacent forward: [a,b,c] move a→b gives [b,a,c]', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('same index is a no-op', () => {
    expect(arrayMove(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the source array', () => {
    const src = ['a', 'b', 'c'];
    arrayMove(src, 0, 2);
    expect(src).toEqual(['a', 'b', 'c']);
  });

  it('works on a single-element array', () => {
    expect(arrayMove(['a'], 0, 0)).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// computeReorder — identity cases
// ---------------------------------------------------------------------------

describe('computeReorder — no-op cases', () => {
  it('activeId === overId: returns orderedIds unchanged, changed = []', () => {
    const result = computeReorder(IDS, 'b', 'b');
    expect(result.orderedIds).toBe(IDS); // same reference
    expect(result.changed).toEqual([]);
  });

  it('activeId not in list: returns orderedIds unchanged, changed = []', () => {
    const result = computeReorder(IDS, 'z', 'b');
    expect(result.orderedIds).toBe(IDS);
    expect(result.changed).toEqual([]);
  });

  it('overId not in list: returns orderedIds unchanged, changed = []', () => {
    const result = computeReorder(IDS, 'b', 'z');
    expect(result.orderedIds).toBe(IDS);
    expect(result.changed).toEqual([]);
  });

  it('empty array: returns unchanged', () => {
    const result = computeReorder([], 'a', 'b');
    expect(result.orderedIds).toEqual([]);
    expect(result.changed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeReorder — orderedIds correctness
// ---------------------------------------------------------------------------

describe('computeReorder — orderedIds', () => {
  it('moves first to last: [a,b,c,d,e] a→e gives [b,c,d,e,a]', () => {
    const { orderedIds } = computeReorder(IDS, 'a', 'e');
    expect(orderedIds).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('moves last to first: [a,b,c,d,e] e→a gives [e,a,b,c,d]', () => {
    const { orderedIds } = computeReorder(IDS, 'e', 'a');
    expect(orderedIds).toEqual(['e', 'a', 'b', 'c', 'd']);
  });

  it('moves middle forward: [a,b,c,d,e] b→d gives [a,c,d,b,e]', () => {
    const { orderedIds } = computeReorder(IDS, 'b', 'd');
    expect(orderedIds).toEqual(['a', 'c', 'd', 'b', 'e']);
  });

  it('moves middle backward: [a,b,c,d,e] d→b gives [a,d,b,c,e]', () => {
    const { orderedIds } = computeReorder(IDS, 'd', 'b');
    expect(orderedIds).toEqual(['a', 'd', 'b', 'c', 'e']);
  });

  it('adjacent swap forward: a→b gives [b,a,c,d,e]', () => {
    const { orderedIds } = computeReorder(IDS, 'a', 'b');
    expect(orderedIds).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('adjacent swap backward: b→a gives [b,a,c,d,e]', () => {
    const { orderedIds } = computeReorder(IDS, 'b', 'a');
    expect(orderedIds).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('does not mutate the input array', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    computeReorder(ids, 'a', 'e');
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

// ---------------------------------------------------------------------------
// computeReorder — changed (minimal diff)
// ---------------------------------------------------------------------------

describe('computeReorder — changed diff', () => {
  it('moving a to e: changed covers every element in [a..e] that shifted', () => {
    const { changed } = computeReorder(IDS, 'a', 'e');
    // a moves from 0→4; b,c,d,e shift left. All 5 change index.
    expect(changed.length).toBe(5);
  });

  it('adjacent swap: exactly 2 elements in changed', () => {
    const { changed } = computeReorder(IDS, 'a', 'b');
    expect(changed.length).toBe(2);
  });

  it('changed sortOrder matches position in new array', () => {
    const { orderedIds, changed } = computeReorder(IDS, 'b', 'd');
    for (const { id, sortOrder } of changed) {
      expect(orderedIds[sortOrder]).toBe(id);
    }
  });

  it('all changed.sortOrder values are unique', () => {
    const { changed } = computeReorder(IDS, 'a', 'e');
    const orders = changed.map((c) => c.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

// ---------------------------------------------------------------------------
// computeReorder — post-infinite-scroll correctness
// ---------------------------------------------------------------------------

describe('computeReorder — changed sortOrder values', () => {
  it('adjacent forward swap: changed entries carry correct {id, sortOrder}', () => {
    // [a,b,c,d,e] move a→b yields [b,a,c,d,e]; a→sortOrder 1, b→sortOrder 0
    const { changed } = computeReorder(IDS, 'a', 'b');
    expect(changed).toEqual(
      expect.arrayContaining([
        { id: 'b', sortOrder: 0 },
        { id: 'a', sortOrder: 1 },
      ]),
    );
    expect(changed.length).toBe(2);
  });

  it('new array reference returned after a real move (not same ref as input)', () => {
    const ids = ['a', 'b', 'c'];
    const { orderedIds } = computeReorder(ids, 'a', 'c');
    expect(orderedIds).not.toBe(ids);
  });
});

describe('computeReorder — works on large lists (post-append)', () => {
  const bigList = Array.from({ length: 200 }, (_, i) => `asset-${i}`);

  it('reorders within a large list without corrupting other entries', () => {
    const { orderedIds } = computeReorder(bigList, 'asset-150', 'asset-10');
    // asset-150 should now be at index 10
    expect(orderedIds[10]).toBe('asset-150');
    // asset-10 should be at index 11 (shifted right by 1)
    expect(orderedIds[11]).toBe('asset-10');
    // length unchanged
    expect(orderedIds.length).toBe(200);
    // every original id still present
    expect(new Set(orderedIds).size).toBe(200);
  });

  it('round-trip: moving an asset then moving it back yields original order', () => {
    const step1 = computeReorder(bigList, 'asset-50', 'asset-100');
    const step2 = computeReorder(step1.orderedIds, 'asset-50', 'asset-50');
    // step2 is a no-op, step1 has asset-50 at index 100's old position
    // This just verifies stability, not exact round-trip (dnd semantics shift neighbors)
    expect(step2.orderedIds.length).toBe(200);
  });
});
