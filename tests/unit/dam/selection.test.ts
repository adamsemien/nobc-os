import { describe, it, expect } from 'vitest';
import { toggleSelection, selectAll, clearSelection } from '@/lib/dam/selection';

// Pins the pure selection-state transitions extracted from MediaWorkspace.onToggle.
// These match the shift-range + toggle semantics MediaGrid exposes to the user.

const IDS = ['a', 'b', 'c', 'd', 'e'];

// ---------------------------------------------------------------------------
// toggleSelection — plain toggle (no shift)
// ---------------------------------------------------------------------------

describe('toggleSelection — plain toggle', () => {
  it('adds id when not in selection', () => {
    const { selection } = toggleSelection(new Set(), 'a', false, IDS, null);
    expect(selection.has('a')).toBe(true);
    expect(selection.size).toBe(1);
  });

  it('removes id when already selected', () => {
    const { selection } = toggleSelection(new Set(['a', 'b']), 'a', false, IDS, null);
    expect(selection.has('a')).toBe(false);
    expect(selection.has('b')).toBe(true);
  });

  it('does not mutate the input set', () => {
    const current = new Set(['a']);
    toggleSelection(current, 'b', false, IDS, null);
    expect(current.size).toBe(1);
  });

  it('removing last item yields empty selection', () => {
    const { selection } = toggleSelection(new Set(['a']), 'a', false, IDS, null);
    expect(selection.size).toBe(0);
  });

  it('returns nextAnchor matching the clicked id index', () => {
    const { nextAnchor } = toggleSelection(new Set(), 'c', false, IDS, null);
    expect(nextAnchor).toBe(2); // 'c' is at index 2
  });

  it('returns nextAnchor null when id not in orderedIds', () => {
    const { nextAnchor } = toggleSelection(new Set(), 'z', false, IDS, null);
    expect(nextAnchor).toBeNull();
  });

  it('plain toggle with existing anchor does NOT extend a range', () => {
    // anchorIndex is provided but range=false — plain toggle only
    const { selection } = toggleSelection(new Set(['a']), 'd', false, IDS, 0);
    expect(selection.has('d')).toBe(true);
    expect(selection.has('b')).toBe(false); // b,c not added
    expect(selection.has('c')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toggleSelection — range select (shift held)
// ---------------------------------------------------------------------------

describe('toggleSelection — range select', () => {
  it('forward range: anchor=0, click=2 adds a,b,c', () => {
    const { selection } = toggleSelection(new Set(), 'c', true, IDS, 0);
    expect([...selection].sort()).toEqual(['a', 'b', 'c']);
  });

  it('backward range: anchor=4, click=2 adds c,d,e', () => {
    const { selection } = toggleSelection(new Set(), 'c', true, IDS, 4);
    expect([...selection].sort()).toEqual(['c', 'd', 'e']);
  });

  it('range with anchor === click index adds only that id', () => {
    const { selection } = toggleSelection(new Set(), 'b', true, IDS, 1);
    expect([...selection]).toEqual(['b']);
  });

  it('range always adds (never removes existing items outside range)', () => {
    // 'e' is pre-selected; range a→c; e remains
    const { selection } = toggleSelection(new Set(['e']), 'c', true, IDS, 0);
    expect(selection.has('e')).toBe(true);
    expect(selection.has('a')).toBe(true);
    expect(selection.has('c')).toBe(true);
  });

  it('range with no anchor (null) falls through to plain toggle', () => {
    // anchorIndex null means range cannot be computed — plain toggle applies
    const { selection } = toggleSelection(new Set(), 'c', true, IDS, null);
    expect(selection.has('c')).toBe(true);
    expect(selection.size).toBe(1); // only 'c', not a full range
  });

  it('range when id not in orderedIds falls through to plain toggle (add)', () => {
    // idx=-1 means range guard fails, plain add applies
    const { selection } = toggleSelection(new Set(), 'z', true, ['a', 'b'], 0);
    expect(selection.has('z')).toBe(true);
  });

  it('nextAnchor is updated to clicked index after range select', () => {
    const { nextAnchor } = toggleSelection(new Set(), 'e', true, IDS, 0);
    expect(nextAnchor).toBe(4); // 'e' is at index 4
  });

  it('full range forward covers correct ids', () => {
    const { selection } = toggleSelection(new Set(), 'e', true, IDS, 0);
    expect([...selection].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('range adds to existing non-overlapping selection', () => {
    // anchor=3 (d), click=4 (e) — should add d,e; a stays
    const { selection } = toggleSelection(new Set(['a']), 'e', true, IDS, 3);
    expect(selection.has('a')).toBe(true);
    expect(selection.has('d')).toBe(true);
    expect(selection.has('e')).toBe(true);
    expect(selection.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// selectAll
// ---------------------------------------------------------------------------

describe('selectAll', () => {
  it('returns a Set containing all ids', () => {
    const s = selectAll(IDS);
    expect(s.size).toBe(IDS.length);
    for (const id of IDS) expect(s.has(id)).toBe(true);
  });

  it('returns empty Set for empty orderedIds', () => {
    expect(selectAll([]).size).toBe(0);
  });

  it('returns a new Set (not a reference to input)', () => {
    const ids = ['x', 'y'];
    const s = selectAll(ids);
    ids.push('z');
    expect(s.has('z')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearSelection
// ---------------------------------------------------------------------------

describe('clearSelection', () => {
  it('returns an empty Set', () => {
    expect(clearSelection().size).toBe(0);
  });

  it('returns a new Set each call', () => {
    const a = clearSelection();
    const b = clearSelection();
    expect(a).not.toBe(b);
  });
});
