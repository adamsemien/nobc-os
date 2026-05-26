export interface Pos {
  top: number;
  left: number;
}

/**
 * FLIP "invert": the translate transform that visually places a tile at its OLD
 * position, given its NEW (post-layout) position. Animate from this back to
 * identity (transform: '') to get the slide. Pure — unit-testable.
 */
export function invert(oldPos: Pos, newPos: Pos): { dx: number; dy: number } {
  return { dx: oldPos.left - newPos.left, dy: oldPos.top - newPos.top };
}
