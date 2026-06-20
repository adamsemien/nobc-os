/**
 * Pure selection-state transitions for the DAM media grid.
 * No React, no DOM — unit-testable in Node.
 *
 * These mirror the inline logic in MediaWorkspace.onToggle exactly:
 *   - Plain toggle (no shift): add if absent, remove if present.
 *   - Range toggle (shift-click): add every id between anchorIndex and
 *     clickedIndex (inclusive). Never removes from an existing selection.
 *   - Select-all: add every id in orderedIds.
 *   - Clear: empty set.
 *
 * The caller is responsible for maintaining the anchor index (lastClicked
 * in MediaWorkspace) and passing it here. Returning the new anchor index
 * alongside the set keeps MediaWorkspace's wiring trivial.
 */

export interface ToggleResult {
  selection: Set<string>;
  /** New anchor index to store in lastClicked.current, or null if unchanged. */
  nextAnchor: number | null;
}

/**
 * Toggle `id` in `current` selection, optionally extending a shift-range.
 *
 * @param current      Existing selection set (not mutated).
 * @param id           The asset id being clicked.
 * @param range        True when the shift key is held.
 * @param orderedIds   Ordered list of all visible asset ids (used for range).
 * @param anchorIndex  Index of the last-clicked item (lastClicked.current).
 *                     Pass null when no prior click exists.
 */
export function toggleSelection(
  current: Set<string>,
  id: string,
  range: boolean,
  orderedIds: string[],
  anchorIndex: number | null,
): ToggleResult {
  const idx = orderedIds.indexOf(id);
  const next = new Set(current);

  if (range && anchorIndex != null && idx >= 0) {
    const lo = Math.min(anchorIndex, idx);
    const hi = Math.max(anchorIndex, idx);
    for (let i = lo; i <= hi; i++) next.add(orderedIds[i]);
  } else if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }

  // Mirror MediaWorkspace: only update the anchor when idx is found
  const nextAnchor = idx >= 0 ? idx : null;
  return { selection: next, nextAnchor };
}

/**
 * Select all ids in orderedIds. Returns a new Set.
 */
export function selectAll(orderedIds: string[]): Set<string> {
  return new Set(orderedIds);
}

/**
 * Clear all selections. Returns an empty Set.
 */
export function clearSelection(): Set<string> {
  return new Set();
}
