/** Skeleton — CRM loading primitive (tranche S).
 *
 *  Uses the existing `.skeleton` shimmer class from globals.css so it inherits
 *  the per-theme colours and the `prefers-reduced-motion` rule already defined
 *  there (the animation is only applied under `no-preference`).
 *
 *  Usage:
 *    <Skeleton className="h-4 w-32" />           // inline width/height
 *    <Skeleton height={16} width={128} />         // numeric px shorthand
 */

import { type CSSProperties } from 'react';

type Props = {
  className?: string;
  height?: number;
  width?: number | string;
  /** Round to a full circle — useful for avatar-shaped skeletons. */
  circle?: boolean;
  style?: CSSProperties;
};

export function Skeleton({ className = '', height, width, circle, style }: Props) {
  const inlineStyle: CSSProperties = {
    ...(height != null ? { height } : {}),
    ...(width != null ? { width } : {}),
    ...(circle ? { borderRadius: '50%' } : {}),
    ...style,
  };

  return (
    <div
      className={`skeleton ${className}`}
      style={inlineStyle}
      aria-hidden="true"
    />
  );
}
