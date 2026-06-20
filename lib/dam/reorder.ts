/**
 * Pure reorder helpers for DAM drag-to-arrange.
 * No DB, no side effects, unit-testable.
 *
 * The server persists sortOrder as the index within orderedIds — so the
 * caller sends the FULL in-memory ordered id list. The "minimal diff"
 * optimization here computes which ids actually changed sortOrder (by
 * comparing before/after index), so the caller can log/audit or send a
 * tighter payload if the server ever supports partial reorder.
 *
 * For now, the bulk 'reorder' endpoint always receives the full orderedIds
 * array and resets ALL sortOrder values — that's correct and safe.
 */

export interface ReorderResult {
  /** New full ordered id array after the move. */
  orderedIds: string[];
  /**
   * Minimal diff: only the ids whose sortOrder (= array index) changed.
   * Useful for logging and future partial-update endpoints.
   */
  changed: { id: string; sortOrder: number }[];
}

/**
 * Move `activeId` to the position currently occupied by `overId`.
 *
 * Uses the same index-swap semantics as @dnd-kit/sortable arrayMove:
 * splice out the active element and insert it at the over element's index.
 *
 * Returns the new ordered array + the minimal changed set.
 *
 * @throws never — if ids are not found, returns orderedIds unchanged with empty changed.
 */
export function computeReorder(
  orderedIds: string[],
  activeId: string,
  overId: string,
): ReorderResult {
  if (activeId === overId) {
    return { orderedIds, changed: [] };
  }

  const fromIdx = orderedIds.indexOf(activeId);
  const toIdx = orderedIds.indexOf(overId);

  if (fromIdx === -1 || toIdx === -1) {
    // IDs not found — bail out safely
    return { orderedIds, changed: [] };
  }

  const next = arrayMove(orderedIds, fromIdx, toIdx);

  // Compute minimal diff: ids whose index changed between old and new array
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  const changed: { id: string; sortOrder: number }[] = [];
  for (let i = lo; i <= hi; i++) {
    if (next[i] !== orderedIds[i]) {
      changed.push({ id: next[i], sortOrder: i });
    }
  }

  return { orderedIds: next, changed };
}

/**
 * Move item at `from` to `to`, shifting intermediate elements.
 * Pure — equivalent to @dnd-kit/sortable's arrayMove but without the import.
 */
export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Given the full server-persisted ordered id list (after a reload),
 * returns the same list — convenience for callers that need to reset
 * local state after a successful persist.
 */
export function resetToServerOrder(serverIds: string[]): string[] {
  return serverIds.slice();
}
