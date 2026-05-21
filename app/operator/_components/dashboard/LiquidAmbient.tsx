/**
 * The faint, slowly drifting warm wash behind the operator home.
 *
 * Three blurred radial blobs at low opacity (`.op-blob` in globals.css), tinted
 * from the active theme's accent tokens. Fixed, decorative, non-interactive.
 * The "liquid" feeling comes from the frosted panels + motion, not from this —
 * the ambient stays quiet on purpose. Drift is gated by prefers-reduced-motion.
 */
export function LiquidAmbient() {
  return (
    <div className="op-ambient" aria-hidden="true">
      <div className="op-blob op-blob-1" />
      <div className="op-blob op-blob-2" />
      <div className="op-blob op-blob-3" />
    </div>
  );
}
