import type { CSSProperties, ReactNode } from 'react';

/**
 * Frosted-glass panel primitive — the material for the liquid-editorial dashboard.
 *
 * All visual properties (translucent fill, bright top edge, inset highlight, drop
 * shadow, hover lift + sheen sweep, backdrop blur) live on `.op-glass` /
 * `.op-glass-strong` in globals.css and are fully theme-token-driven, so the panel
 * renders correctly across every operator theme.
 *
 * `strong` selects the denser fill used for dominant panels (e.g. the lead figure).
 */
export function GlassPanel({
  strong = false,
  className,
  style,
  children,
}: {
  strong?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={`${strong ? 'op-glass-strong' : 'op-glass'} ${className ?? ''}`}
      style={style}
    >
      {children}
    </div>
  );
}
